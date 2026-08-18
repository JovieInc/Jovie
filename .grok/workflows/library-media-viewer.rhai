let meta = #{
    name: "library-media-viewer",
    description: "Research, audit, and ship a Frame.io/PIX-class unified media viewer after Tim locks the prototype",
    when_to_use: "When refactoring Jovie Library into a world-class media viewer across iOS, web, and Ovie",
    phases: [
        #{ title: "Research", detail: "UX signals and current surfaces" },
        #{ title: "Audit", detail: "iOS/web/audio-player contracts" },
        #{ title: "Prototype", detail: "Stop until Tim locks" },
        #{ title: "Implement", detail: "Ship only after lock" },
        #{ title: "Verify", detail: "Adversarial proof" },
    ],
};

let brief_schema = #{
    "type": "object",
    "required": ["findings"],
    "properties": #{
        "findings": #{
            "type": "array",
            "maxItems": 8,
            "items": #{
                "type": "object",
                "required": ["file", "issue"],
                "properties": #{
                    "file": #{ "type": "string" },
                    "issue": #{ "type": "string" },
                },
            },
        },
    },
};

let verdict_schema = #{
    "type": "object",
    "required": ["real", "reason", "evidence"],
    "properties": #{
        "real": #{ "type": "boolean" },
        "reason": #{ "type": "string" },
        "evidence": #{ "type": "string" },
    },
};

fn trimmed(s) {
    if type_of(s) == "string" {
        s.trim();
        s
    } else {
        ""
    }
}

let mode = "research";
let locked = false;
if args != () {
    if args.mode != () { mode = args.mode; }
    if args.locked != () { locked = args.locked; }
}

let repo = "apps/ios/Jovie/Features/Library and apps/web library + audio player";
if args != () && args.repo != () {
    repo = args.repo;
}

if mode != "research" && mode != "ship" {
    pause("verification", "Pass args.mode as research or ship.");
}

phase("Research");
log("Researching current library + playback contracts");

let research_prompt = "";
research_prompt += "Read-only. Inspect the Jovie repo for the current Library, audio player, ";
research_prompt += "and just-shot vlog playback on iOS and web. Paths to start: ";
research_prompt += repo;
research_prompt += ". Also read apps/ios/Jovie/Features/Library, apps/ios/Jovie/Features/Teleprompter, ";
research_prompt += "and search web for audio player / now-playing. ";
research_prompt += "Use read_file and grep. Do not edit. ";
research_prompt += "Return at most 8 findings as {file, issue} about what a Frame.io/PIX + iPod list ";
research_prompt += "viewer must change. Empty list is valid only after you have read the code. ";
research_prompt += "Hard constraints from Tim: full-width native list; video/audio/docs/releases/merch; ";
research_prompt += "smart links are NOT a filter; entities mirror the right rail; unified native playback; ";
research_prompt += "tie into the existing audio player; do not ship until Tim locks the prototype.";

let research = agent(research_prompt, #{
    label: "research:library",
    capability_mode: "read-only",
    output_schema: brief_schema,
});

phase("Audit");
let audit_jobs = [];
let surfaces = ["ios library list", "web library", "audio player handoff"];
for surface in surfaces {
    let p = "";
    p += "Audit this Jovie surface for media-viewer readiness: ";
    p += surface;
    p += ". Use read_file/grep on the real code. Report at most 8 {file, issue} findings. ";
    p += "Empty is valid only after reading. Do not edit.";
    audit_jobs.push(#{
        prompt: p,
        label: "audit:" + surface,
        capability_mode: "read-only",
        output_schema: brief_schema,
    });
}
let audits = parallel(audit_jobs);

let findings = [];
if research != () && research.success && research.output.findings != () {
    for f in research.output.findings { findings.push(f); }
}
for r in audits {
    if r != () && r.success && r.output.findings != () {
        for f in r.output.findings { findings.push(f); }
    }
}

phase("Prototype");
if !locked {
    let report = "";
    report += "# Library media viewer\n\n";
    report += "Mode: " + mode + "\n";
    report += "Lock: false. Do not implement. Iterate HTML prototypes with Tim first.\n\n";
    report += "Findings: " + findings.len().to_string() + "\n";
    let path = write_scratch_file("library-media-viewer.md", report);
    complete(#{
        summary: "Prototype gate: Tim has not locked the design. Do not ship Library.",
        locked: false,
        findings_count: findings.len(),
        path: path,
    });
}

if mode != "ship" {
    complete(#{
        summary: "Research-only run. Pass args.mode=ship and args.locked=true after Tim locks.",
        locked: locked,
        findings_count: findings.len(),
    });
}

phase("Implement");
let implement_prompt = "";
implement_prompt += "Tim locked the library media viewer. Implement the iPod-like full-width list ";
implement_prompt += "plus native unified playback that hands off to the existing audio player. ";
implement_prompt += "Surfaces: iOS first, then web parity. Smart links must not be a filter. ";
implement_prompt += "Documents, releases, merch, video, audio all in one list. ";
implement_prompt += "Read the code, then edit. Keep changes scoped to library + player + entity rail.";

let shipped = agent(implement_prompt, #{
    label: "implement:library",
    capability_mode: "all",
});

phase("Verify");
let verify_jobs = [];
let i = 0;
let max_v = 6;
for f in findings {
    if i >= max_v { break; }
    let vp = "";
    vp += "Adversarially verify this library-viewer finding by reading shipped code: \"";
    vp += f.issue;
    vp += "\" in ";
    vp += f.file;
    vp += ". Set real=true only with concrete evidence you inspected. Else real=false.";
    verify_jobs.push(#{
        prompt: vp,
        label: "verify:" + i.to_string(),
        capability_mode: "read-only",
        output_schema: verdict_schema,
    });
    i += 1;
}

let confirmed = 0;
if verify_jobs.len() > 0 {
    let verdicts = parallel(verify_jobs);
    for v in verdicts {
        if v != () && v.success && v.output.real == true {
            let ev = trimmed(v.output.evidence);
            if ev != "" { confirmed += 1; }
        }
    }
}

let shipped_ok = shipped != () && shipped.success;
complete(#{
    summary: "Library viewer ship attempted. confirmed=" + confirmed.to_string(),
    locked: true,
    shipped: shipped_ok,
    confirmed: confirmed,
});
