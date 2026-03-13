import { runCommand } from "../../../utils/exec";
import logger from "../../../utils/logger";
import { getPlatformStrategy } from "../../../utils/platform/index";

const platform = getPlatformStrategy();

/**
 * Set nickname for a J-Link probe via JLink CLI.
 * Pass empty string to clear nickname (reset to <not set>).
 *
 * Flow:
 *   exec DisableAutoUpdateFW
 *   selectprobe
 *   <index>
 *   setnickname <nickname>   ← empty string clears nickname
 *   exit
 *
 * JLink responds: Nickname "<n>" was set. To take effect the probe needs to be power-cycled.
 */
export async function setProbeNickname(
  probeIndex: number,
  nickname: string,
  jlinkBin: string = platform.jlinkBin,
  timeoutMs = 15_000,
): Promise<{ success: boolean; error?: string }> {
  const nicknameArg = nickname.trim();
  const setCmd = nicknameArg ? `setnickname ${nicknameArg}` : "setnickname ";

  const input = [
    "exec DisableAutoUpdateFW",
    "selectprobe",
    String(probeIndex),
    setCmd,
    "exit",
  ].join("\n") + "\n";

  logger.info(`[setNickname] Probe[${probeIndex}] setting nickname to "${nicknameArg || "<empty>"}"`);
  logger.info(`[setNickname] Input commands:\n${input}`);

  try {
    const result = await runCommand(jlinkBin, ["-NoGUI", "1"], {
      input,
      timeout: timeoutMs,
      windowsHide: true,
      env: { JLINK_NO_GUI: "1" },
    });

    const stdout = result.stdout;
    logger.info(`[setNickname] stdout: ${stdout}`);

    if (stdout.includes("was set") || stdout.includes("was unset")) {
      logger.info(`[setNickname] Probe[${probeIndex}] nickname ${nicknameArg ? `set to "${nicknameArg}"` : "cleared"}`);
      return { success: true };
    }

    if (stdout.includes("is not a valid nickname")) {
      logger.warn(`[setNickname] Invalid nickname rejected by J-Link: "${nicknameArg}"`);
      return { success: false, error: "Invalid nickname: only ASCII characters are allowed, double quotes (\") are not permitted." };
    }

    logger.warn(`[setNickname] Unexpected output — no "was set" found`);
    return { success: false, error: "Unexpected response from J-Link" };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[setNickname] Failed: ${msg}`);
    return { success: false, error: msg };
  }
}