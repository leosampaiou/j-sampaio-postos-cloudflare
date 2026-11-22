import { describe, expect, it } from "vitest";
import {
  toggleClosureParticipant,
  toClosureParticipantPayload,
  type ClosureParticipantDraft,
} from "./closureParticipants";

describe("closure participant selection", () => {
  it("assigns 100% automatically when the first frentista is selected", () => {
    expect(toggleClosureParticipant([], 7, true)).toEqual([
      { employeeId: 7, sharePercent: "100" },
    ]);
  });

  it("clears the automatic single share when a second person is added", () => {
    const current: ClosureParticipantDraft[] = [
      { employeeId: 7, sharePercent: "100" },
    ];
    expect(toggleClosureParticipant(current, 9, true)).toEqual([
      { employeeId: 7, sharePercent: "" },
      { employeeId: 9, sharePercent: "" },
    ]);
  });

  it("restores 100% automatically when a selection returns to one person", () => {
    const current: ClosureParticipantDraft[] = [
      { employeeId: 7, sharePercent: "55" },
      { employeeId: 9, sharePercent: "45" },
    ];
    expect(toggleClosureParticipant(current, 9, false)).toEqual([
      { employeeId: 7, sharePercent: "100" },
    ]);
  });

  it("preserves a multi-person allocation when adding another participant", () => {
    const current: ClosureParticipantDraft[] = [
      { employeeId: 7, sharePercent: "60" },
      { employeeId: 9, sharePercent: "40" },
    ];
    expect(toggleClosureParticipant(current, 11, true)).toEqual([
      ...current,
      { employeeId: 11, sharePercent: "" },
    ]);
  });

  it("submits one participant as 100% even when the draft field is blank", () => {
    expect(
      toClosureParticipantPayload([{ employeeId: 7, sharePercent: "" }])
    ).toEqual([{ employeeId: 7, sharePercent: 100 }]);
  });
});
