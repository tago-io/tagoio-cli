import { cloneDeep } from "lodash";

import exportHolder from "./mock/exportHolder.json";
import runInfo from "./mock/run.json";
import targetRunInfo from "./mock/targetRun.json";
import { updateSideBarButtons, updateSigninButtons } from "./run-buttons-export";

describe("Collect ID", () => {
  test("Update Signin Buttons", () => {
    const copyTargetRun = cloneDeep(targetRunInfo);
    expect(copyTargetRun.signin_buttons.length).toBe(0);
    expect(runInfo.signin_buttons[0].url).toBe(
      "originTest.run.tago.io/dashboards/info/6387b32e5b570000112303fe?anonymousToken=00000000-6386-4535-8ccb-e400205c3058"
    );
    // @ts-expect-error ignore the error
    updateSigninButtons(runInfo, copyTargetRun, exportHolder);

    expect(copyTargetRun.signin_buttons.length).toBe(1);
    // @ts-expect-error type are different after update
    expect(copyTargetRun.signin_buttons[0].url).toBe(
      "resultTest.run.tago.io/dashboards/info/73656d1df7cb62001163c3de?anonymousToken=00000000-7386-4535-8ccb-e400205c3051"
    );
  });

  test("Update Sidebar Buttons", () => {
    const copyTargetRun = cloneDeep(targetRunInfo);
    expect(copyTargetRun.sidebar_buttons.length).toBe(0);
    updateSideBarButtons(runInfo as any, copyTargetRun as any, exportHolder);

    expect(copyTargetRun.sidebar_buttons.length).toBe(2);
    // @ts-expect-error types are different after update
    expect(copyTargetRun.sidebar_buttons[0].value).toBe("7324b541bd887900183227b2");
    // @ts-expect-error types are different after update
    expect(copyTargetRun.sidebar_buttons[1].value).toBe("7324b554218476001907b74d");
  });
});
