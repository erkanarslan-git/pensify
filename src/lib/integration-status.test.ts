import { expect, it } from "vitest";
import { bankConnectionState, channelConnectionState } from "./integration-status";
it("bank without an adapter is not a real connected bank", () => { expect(bankConnectionState(false, "connected")).toBe("not_configured"); });
it("account and configuration alone do not prove channel connection", () => { expect(channelConnectionState(true, true, false, false)).toBe("preparation"); });
it("confirmed channel activity distinguishes connected and error", () => { expect(channelConnectionState(true, true, true, false)).toBe("connected"); expect(channelConnectionState(true, true, true, true)).toBe("error"); });