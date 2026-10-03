/** Agent homes whose `skills/` dir loads SKILL.md folders. */
export declare const SKILL_TARGETS: readonly [{
    readonly agent: "claude";
    readonly home: ".claude";
}, {
    readonly agent: "codex";
    readonly home: ".codex";
}, {
    readonly agent: "openclaw";
    readonly home: ".openclaw";
}, {
    readonly agent: "hermes";
    readonly home: ".hermes";
}];
export interface InitResult {
    readonly installed: readonly string[];
    readonly skipped: readonly string[];
}
/**
 * Write `jovie/SKILL.md` into every installed agent's skills dir, or only into
 * `dir` when given. Agents that aren't installed are skipped, never created.
 */
export declare function installSkill(homeDir: string, dir?: string): InitResult;
//# sourceMappingURL=init.d.ts.map