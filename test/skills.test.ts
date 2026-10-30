import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultParams } from "#shared/params";
import { crc32, createZip, ROLES, renderSkill, skillDescription } from "../src/index.js";

const dir = resolve(import.meta.dirname, "../skills/templates");
const templates = Object.fromEntries(
  readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => [
      file.slice(0, -3),
      readFileSync(join(dir, file), "utf8").replace(/\r\n/gu, "\n"),
    ]),
);

describe("role skills", () => {
  it("ships English templates only", () => {
    expect(Object.keys(templates).sort()).toEqual(
      ["_onboarding", "_reporting", "_rewards", ...ROLES].sort(),
    );
  });

  for (const role of ROLES)
    it(`renders ${role} with no leftover placeholders`, () => {
      const markdown = renderSkill(templates, role);
      expect(markdown).not.toMatch(/\{\{/u);
      expect(markdown.startsWith("---\nname: agentsgot-")).toBe(true);
      expect(skillDescription(markdown).length).toBeGreaterThan(40);
      // Safety notice and the confirmation gate must be in every skill.
      expect(markdown).toContain("do not paste a private key");
      expect(markdown).toContain("--auto-send");
    });

  it("takes stake thresholds from params.json", () => {
    expect(renderSkill(templates, "tester")).toContain(`${defaultParams.testerMinStakeAgt} AGT`);
    expect(renderSkill(templates, "arbitrator")).toContain(
      `${defaultParams.arbitratorMinStakeAgt} AGT`,
    );
    expect(renderSkill(templates, "publisher")).toContain(
      `${defaultParams.publisherBaseStakeAgt} AGT base`,
    );
  });

  it("tells executors to draw testers themselves", () => {
    expect(renderSkill(templates, "executor")).toContain("tester-draws/commit");
  });

  for (const role of ["executor", "tester", "arbitrator"] as const)
    it(`gives ${role} the v3 vesting and arbitration stream claim loops`, () => {
      const skill = renderSkill(templates, role);
      expect(skill).toContain("POST /rewards/claim-intents");
      expect(skill).toContain("GET /rewards/arb-stream/pending");
      expect(skill).toContain("POST /rewards/arbitration-stream-claim-intent");
      expect(skill).not.toContain("/emission/allocations");
      expect(skill).not.toContain("/emission/claim-intents");
      expect(skill).toContain("keeper is an availability convenience");
      expect(skill).toContain("A role or pool membership alone creates no entitlement");
      expect(skill).toContain("| rewards | 6h | 3h | yes |");
    });

  it("does not assign mining reward loops to publishers", () => {
    const publisher = renderSkill(templates, "publisher");
    expect(publisher).not.toContain("POST /rewards/arbitration-stream-claim-intent");
    expect(publisher).not.toContain("| rewards | 6h | 3h | yes |");
  });

  it("fails loudly on an unknown placeholder", () => {
    expect(() => renderSkill({ ...templates, tester: "{{nope}}" }, "tester")).toThrow(/nope/u);
  });
});

describe("zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789")).toString(16)).toBe("cbf43926");
  });
  it("is deterministic regardless of entry order", () => {
    const a = createZip([
      { path: "b.md", content: "b" },
      { path: "a.md", content: "a" },
    ]);
    const b = createZip([
      { path: "a.md", content: "a" },
      { path: "b.md", content: "b" },
    ]);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(new DataView(a.buffer).getUint32(0, true)).toBe(0x04034b50);
  });
});
