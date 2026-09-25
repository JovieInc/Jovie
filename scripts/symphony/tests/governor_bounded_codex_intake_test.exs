defmodule SymphonyElixir.GovernorBoundedCodexIntakeTest do
  @moduledoc false
  use SymphonyElixir.TestSupport

  alias SymphonyElixir.Linear.Adapter
  alias SymphonyElixir.Linear.Client
  alias SymphonyElixir.Orchestrator
  alias SymphonyElixir.Orchestrator.State
  alias SymphonyElixir.Tracker.Issue

  @auth_labels ["blocked:auth", "auth", "area:auth"]
  @billing_labels ["billing", "blocked:payments", "stripe"]
  @infra_labels ["infra", "area:infra", "infrastructure", "vercel"]
  @active_states ["Todo", "In Progress", "Rework", "Merging"]

  setup do
    previous = System.get_env("LINEAR_API_KEY")
    System.put_env("LINEAR_API_KEY", "fixture-token")
    load_profile!()

    on_exit(fn ->
      if is_binary(previous) do
        System.put_env("LINEAR_API_KEY", previous)
      else
        System.delete_env("LINEAR_API_KEY")
      end
    end)

    :ok
  end

  test "selects agent-ready Todo issues across the JOV team" do
    settings = Config.settings!()
    assert settings.tracker.project_slug in [nil, ""]
    assert settings.tracker.required_labels == ["agent-ready"]
    assert settings.tracker.active_states == @active_states
    assert {:ok, {:team, "JOV"}} = Adapter.scope_for(settings.tracker)

    {:ok, issues} =
      Client.fetch_issues_by_states_for_test(@active_states, {:team, "JOV"}, fn query, variables ->
        assert query =~ "query SymphonyLinearTeamPoll"
        assert query =~ "team: {key: {eq: $teamKey}}"
        refute query =~ "projectSlug"
        refute Map.has_key?(variables, :projectSlug)
        assert variables.teamKey == "JOV"
        assert variables.stateNames == @active_states
        {:ok, poll_page(team_fixture_nodes())}
      end)

    by_identifier = Map.new(issues, &{&1.identifier, &1})
    state = state_from_loaded_config()

    outside = Map.fetch!(by_identifier, "JOV-7201")
    inside_pilot = Map.fetch!(by_identifier, "JOV-7202")
    assert outside.state == "Todo"
    assert inside_pilot.state == "Todo"
    assert "agent-ready" in outside.labels
    assert "agent-ready" in inside_pilot.labels
    assert Orchestrator.should_dispatch_issue_for_test(outside, state)
    assert Orchestrator.should_dispatch_issue_for_test(inside_pilot, state)
    refute Orchestrator.should_dispatch_issue_for_test(Map.fetch!(by_identifier, "JOV-7203"), state)
  end

  test "requires every configured label before dispatch" do
    only_agent_ready = ready_issue("JOV-7301", "Todo", ["agent-ready"])
    both_labels = ready_issue("JOV-7302", "Todo", ["agent-ready", "ready-for-intake"])
    intake_only = ready_issue("JOV-7303", "Todo", ["ready-for-intake"])

    with_workflow_copy(&require_both_labels/1, fn ->
      settings = Config.settings!()
      assert settings.tracker.required_labels == ["agent-ready", "ready-for-intake"]
      state = state_from_loaded_config()

      refute Orchestrator.should_dispatch_issue_for_test(only_agent_ready, state)
      refute Orchestrator.should_dispatch_issue_for_test(intake_only, state)
      assert Orchestrator.should_dispatch_issue_for_test(both_labels, state)

      refute Issue.routable?(
               only_agent_ready,
               settings.tracker.required_labels,
               settings.tracker.excluded_labels
             )

      assert Issue.routable?(
               both_labels,
               settings.tracker.required_labels,
               settings.tracker.excluded_labels
             )
    end)
  end

  test "does not dispatch auth, billing, or infra issues" do
    settings = Config.settings!()
    excluded = MapSet.new(settings.tracker.excluded_labels)
    state = state_from_loaded_config()

    for label <- @auth_labels ++ @billing_labels ++ @infra_labels do
      assert MapSet.member?(excluded, label)
      blocked = ready_issue("JOV-EXCL-#{label}", "Todo", ["agent-ready", label])
      refute Orchestrator.should_dispatch_issue_for_test(blocked, state)
    end

    assert MapSet.member?(excluded, "no-symphony")
    assert MapSet.member?(excluded, "cost-monitoring")

    refute Orchestrator.should_dispatch_issue_for_test(
             ready_issue("JOV-7401", "Todo", ["agent-ready", "no-symphony"]),
             state
           )

    refute Orchestrator.should_dispatch_issue_for_test(
             ready_issue("JOV-7402", "Todo", ["agent-ready", "cost-monitoring"]),
             state
           )

    assert Orchestrator.should_dispatch_issue_for_test(
             ready_issue("JOV-7403", "Todo", ["agent-ready", "human-review-required"]),
             state
           )
  end

  test "honors a lower max_concurrent_agents ceiling" do
    settings = Config.settings!()
    assert settings.agent.max_concurrent_agents == 5
    assert length(Regex.scan(~r/max_concurrent_agents: 5/, File.read!(profile_workflow_path()))) == 1

    source_state = state_from_loaded_config()
    assert source_state.max_concurrent_agents == 5
    next_issue = ready_issue("JOV-7501", "Todo", ["agent-ready"])
    assert Orchestrator.should_dispatch_issue_for_test(next_issue, fill_running(source_state, 4))
    refute Orchestrator.should_dispatch_issue_for_test(next_issue, fill_running(source_state, 5))

    with_workflow_copy(&lower_ceiling/1, fn ->
      lowered = Config.settings!()
      assert lowered.agent.max_concurrent_agents == 1
      lowered_state = state_from_loaded_config()
      assert lowered_state.max_concurrent_agents == 1
      assert Orchestrator.should_dispatch_issue_for_test(next_issue, lowered_state)
      refute Orchestrator.should_dispatch_issue_for_test(next_issue, fill_running(lowered_state, 1))
    end)

    assert Config.settings!().agent.max_concurrent_agents == 5
  end

  test "does not dispatch JOV-5914, JOV-6519, PR #17453, or PR #17156" do
    {:ok, issues} =
      Client.fetch_issues_by_states_for_test(@active_states, {:team, "JOV"}, fn _query, variables ->
        assert variables.teamKey == "JOV"
        {:ok, poll_page(protected_fixture_nodes())}
      end)

    by_identifier = Map.new(issues, &{&1.identifier, &1})
    state = state_from_loaded_config()
    settings = Config.settings!()

    for identifier <- ["JOV-5914", "JOV-6519", "JOV-PR-17453", "JOV-PR-17156"] do
      issue = Map.fetch!(by_identifier, identifier)
      refute "agent-ready" in issue.labels

      refute Issue.routable?(
               issue,
               settings.tracker.required_labels,
               settings.tracker.excluded_labels
             )

      refute Orchestrator.should_dispatch_issue_for_test(issue, state)
    end
  end

  defp load_profile! do
    Workflow.set_workflow_file_path(profile_workflow_path())
    assert :ok = WorkflowStore.force_reload()
  end

  defp profile_workflow_path do
    System.get_env("JOVIE_CODEX_WORKFLOW") ||
      raise "JOVIE_CODEX_WORKFLOW must point at governor-bounded-codex/WORKFLOW.md"
  end

  defp state_from_loaded_config do
    config = Config.settings!()

    %State{
      poll_interval_ms: config.polling.interval_ms,
      max_concurrent_agents: config.agent.max_concurrent_agents,
      running: %{}
    }
  end

  defp with_workflow_copy(transform, fun) do
    source = File.read!(profile_workflow_path())
    rewritten = transform.(source)
    assert rewritten != source
    directory = Path.join(System.tmp_dir!(), "codex-selector-#{System.unique_integer([:positive])}")
    File.mkdir_p!(directory)
    path = Path.join(directory, "WORKFLOW.md")
    File.write!(path, rewritten)
    Workflow.set_workflow_file_path(path)
    assert :ok = WorkflowStore.force_reload()

    try do
      fun.()
    after
      load_profile!()
      File.rm_rf(directory)
    end
  end

  defp require_both_labels(source) do
    String.replace(
      source,
      "  required_labels:\n    - agent-ready\n",
      "  required_labels:\n    - agent-ready\n    - ready-for-intake\n",
      global: false
    )
  end

  defp lower_ceiling(source) do
    String.replace(
      source,
      "  max_concurrent_agents: 5\n",
      "  max_concurrent_agents: 1\n",
      global: false
    )
  end

  defp ready_issue(identifier, state_name, labels) do
    %Issue{
      id: "id-#{identifier}",
      identifier: identifier,
      title: identifier,
      state: state_name,
      labels: labels,
      dispatchable: true
    }
  end

  defp fill_running(%State{} = state, count) do
    running =
      Map.new(1..count, fn index ->
        issue = ready_issue("JOV-RUN-#{index}", "Todo", ["agent-ready"])
        {issue.id, %{issue: issue}}
      end)

    %{state | running: running}
  end

  defp team_fixture_nodes do
    [
      linear_node(
        "JOV-7201",
        "Todo",
        ["agent-ready"],
        "Backlog issue outside symphony-ui-pilot-96d6b9c5b2d5"
      ),
      linear_node(
        "JOV-7202",
        "Todo",
        ["Agent-Ready"],
        "Backlog issue inside symphony-ui-pilot-96d6b9c5b2d5"
      ),
      linear_node("JOV-7203", "Todo", [], "Unlabeled Todo on the JOV team")
    ]
  end

  defp protected_fixture_nodes do
    [
      linear_node("JOV-5914", "In Progress", [], "Work tied to GitHub PR #17156"),
      linear_node("JOV-6519", "In Progress", ["devin"], "Rebase PR #17156"),
      linear_node("JOV-PR-17453", "Todo", [], "Work tied to GitHub PR #17453"),
      linear_node("JOV-PR-17156", "Todo", ["ready-for-intake"], "Work tied to pull/17156")
    ]
  end

  defp linear_node(identifier, state_name, labels, title) do
    %{
      "id" => "id-#{identifier}",
      "identifier" => identifier,
      "title" => title,
      "description" => title,
      "state" => %{"name" => state_name},
      "labels" => %{"nodes" => Enum.map(labels, &%{"name" => &1})},
      "priority" => 3,
      "createdAt" => "2026-09-01T00:00:00Z",
      "updatedAt" => "2026-09-01T00:00:00Z"
    }
  end

  defp poll_page(nodes) do
    %{
      "data" => %{
        "issues" => %{
          "nodes" => nodes,
          "pageInfo" => %{"hasNextPage" => false, "endCursor" => nil}
        }
      }
    }
  end
end
