CREATE UNIQUE INDEX IF NOT EXISTS "workflow_runs_execute_approved_action_approval_uniq"
  ON "workflow_runs" USING btree (("step_outputs" ->> 'approvalId'))
  WHERE "kind" = 'execute_approved_action'
    AND "step_outputs" ->> 'approvalId' IS NOT NULL;
