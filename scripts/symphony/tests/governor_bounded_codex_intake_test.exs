defmodule SymphonyElixir.GovernorBoundedCodexIntakeTest do
  @moduledoc """
  Runs the pinned Symphony checkout `dae31f823850c9ef2dea121433e5b60f09af26fa`.
  It does not execute the host's installed openai/symphony `1c0fb6c8` binary.
  Exact protected labels are scheduler exclusions. Identifier, pull-request,
  branch, and `zz-upstream*` refusals come from the Jovie pre-intake check,
  which runs before workspace creation. The pinned scheduler still has no
  identifier denylist.
  """
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
  @pinned_scheduler "dae31f823850c9ef2dea121433e5b60f09af26fa"
  @installed_host_scheduler "1c0fb6c8e8ef9031a2c861e62af5f9e66cee39cb"

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

  test "runs pinned scheduler dae31f8 and not the installed 1c0 build" do
    sha = System.fetch_env!("SYMPHONY_SELECTOR_SHA")
    host = System.fetch_env!("SYMPHONY_HOST_INSTALLED_SHA")
    assert sha == @pinned_scheduler
    assert host == @installed_host_scheduler
    refute sha == host
  end

  test "does not select protected labels, including agent-ready issues" do
    settings = Config.settings!()
    excluded = MapSet.new(settings.tracker.excluded_labels)
    state = state_from_loaded_config()

    for label <- ["hold", "protected", "human-only"] do
      assert MapSet.member?(excluded, label)

      blocked = ready_issue("JOV-7601", "Todo", ["agent-ready", label])
      refute Orchestrator.should_dispatch_issue_for_test(blocked, state)
    end

    refute "human-review-required" in settings.tracker.excluded_labels
    refute "needs-human" in settings.tracker.excluded_labels

    legacy = ready_issue("JOV-7602", "Todo", ["agent-ready", "human-review-required"])
    assert Orchestrator.should_dispatch_issue_for_test(legacy, state)

    prefixed = ready_issue("JOV-7603", "Todo", ["agent-ready", "zz-upstream-cutover"])
    # dae31f8 matches excluded labels exactly, so the prefix stays routable there.
    assert Orchestrator.should_dispatch_issue_for_test(prefixed, state)

    {status, decision} =
      run_gate!([
        gate_issue("JOV-7601", ["agent-ready", "hold"], [], nil),
        gate_issue("JOV-7603", ["agent-ready", "zz-upstream-cutover"], [], nil),
        gate_issue("JOV-7602", ["agent-ready", "human-review-required"], [], nil)
      ])

    assert status == 0
    assert decision["blocked"] == nil
    refute "JOV-7601" in decision["admitted"]
    refute "JOV-7603" in decision["admitted"]
    assert "JOV-7602" in decision["admitted"]
    refute intake_selected?("JOV-7601", decision, ready_issue("JOV-7601", "Todo", ["agent-ready", "hold"]), state)
    refute intake_selected?("JOV-7603", decision, prefixed, state)
    assert intake_selected?("JOV-7602", decision, legacy, state)
  end

  test "does not select protected agent-ready issues by identifier, pull request, or branch" do
    state = state_from_loaded_config()
    by_id = ready_issue("JOV-5914", "In Progress", ["agent-ready"])
    by_pr = ready_issue("JOV-7701", "Todo", ["agent-ready"])
    by_branch = ready_issue("JOV-7702", "Todo", ["agent-ready"])
    open_issue = ready_issue("JOV-7703", "Todo", ["agent-ready"])

    # The pinned scheduler would claim these. Intake must not.
    assert Orchestrator.should_dispatch_issue_for_test(by_id, state)
    assert Orchestrator.should_dispatch_issue_for_test(by_pr, state)
    assert Orchestrator.should_dispatch_issue_for_test(by_branch, state)

    {status, decision} =
      run_gate!([
        gate_issue("JOV-5914", ["agent-ready"], [], nil),
        gate_issue("JOV-6519", ["agent-ready"], [], nil),
        gate_issue("JOV-7701", ["agent-ready"], [17453], nil),
        gate_issue("JOV-7702", ["agent-ready"], [], "cursor/symphony-cursor-capacity-5844"),
        gate_issue("JOV-7704", ["agent-ready"], [17156], nil),
        gate_issue("JOV-7705", ["agent-ready"], [18299], nil),
        gate_issue("JOV-7706", ["agent-ready"], [17511], nil),
        gate_issue("JOV-7707", ["agent-ready"], [], "kimi/JOV-5914-fix"),
        gate_issue("JOV-7708", ["agent-ready"], [], "cursor/gem-gate-issue-blocked-intake-c699"),
        gate_issue("JOV-7709", ["agent-ready"], [], "codex/homepage-canonical-sizing-20260909"),
        gate_issue("JOV-7703", ["agent-ready"], [], nil)
      ])

    assert status == 0
    assert decision["blocked"] == nil
    assert decision["admitted"] == ["JOV-7703"]

    for {identifier, issue} <- [
          {"JOV-5914", by_id},
          {"JOV-7701", by_pr},
          {"JOV-7702", by_branch}
        ] do
      refute intake_selected?(identifier, decision, issue, state)
    end

    assert intake_selected?("JOV-7703", decision, open_issue, state)
  end

  test "a missing or malformed protected list blocks selection" do
    state = state_from_loaded_config()
    issue = ready_issue("JOV-7201", "Todo", ["agent-ready"])
    assert Orchestrator.should_dispatch_issue_for_test(issue, state)
    payload = [gate_issue("JOV-7201", ["agent-ready"], [], nil)]

    missing = Path.join(System.tmp_dir!(), "missing-protected-list-#{System.unique_integer([:positive])}.json")
    {missing_status, missing_decision} = run_gate!(payload, list: missing)
    assert missing_status != 0
    assert missing_decision["blocked"] == "protected-list-unavailable"
    assert missing_decision["admitted"] == []
    refute intake_selected?("JOV-7201", missing_decision, issue, state)

    malformed =
      Path.join(System.tmp_dir!(), "malformed-protected-list-#{System.unique_integer([:positive])}.json")

    File.write!(malformed, "{")

    {malformed_status, malformed_decision} = run_gate!(payload, list: malformed)
    File.rm(malformed)
    assert malformed_status != 0
    assert malformed_decision["blocked"] == "protected-list-unavailable"
    assert malformed_decision["admitted"] == []
    refute intake_selected?("JOV-7201", malformed_decision, issue, state)
  end

  test "unresolved linkage blocks every candidate, including unprotected agent-ready issues" do
    state = state_from_loaded_config()
    issue = ready_issue("JOV-7201", "Todo", ["agent-ready"])
    assert Orchestrator.should_dispatch_issue_for_test(issue, state)

    {status, decision} =
      run_gate!([
        %{
          "identifier" => "JOV-7801",
          "labels" => ["agent-ready"],
          "linkage" => "unresolved"
        },
        gate_issue("JOV-7201", ["agent-ready"], [], nil)
      ])

    assert status != 0
    assert decision["blocked"] == "linkage-unresolved"
    assert decision["admitted"] == []
    refute intake_selected?("JOV-7201", decision, issue, state)
  end

  defp intake_selected?(identifier, decision, issue, state) do
    decision["blocked"] == nil and identifier in decision["admitted"] and
      Orchestrator.should_dispatch_issue_for_test(issue, state)
  end

  defp gate_issue(identifier, labels, pull_requests, branch) do
    %{
      "identifier" => identifier,
      "labels" => labels,
      "pull_requests" => pull_requests,
      "branch" => branch,
      "linkage" => "resolved"
    }
  end

  defp run_gate!(issues, opts \\ []) do
    list_path = Keyword.get(opts, :list, protected_list_path())
    directory = Path.join(System.tmp_dir!(), "codex-intake-#{System.unique_integer([:positive])}")
    File.mkdir_p!(directory)
    issues_path = Path.join(directory, "issues.json")
    File.write!(issues_path, JSON.encode!(%{"issues" => issues}))

    try do
      {output, status} =
        System.cmd(
          "python3",
          [
            protected_check_path(),
            "--issues-file",
            issues_path,
            "--list",
            list_path
          ],
          stderr_to_stdout: false
        )

      {status, JSON.decode!(output)}
    after
      File.rm_rf(directory)
    end
  end

  defp protected_check_path do
    Path.join(Path.dirname(profile_workflow_path()), "protected-intake-check.py")
  end

  defp protected_list_path do
    Path.join(Path.dirname(profile_workflow_path()), "protected-items.json")
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
