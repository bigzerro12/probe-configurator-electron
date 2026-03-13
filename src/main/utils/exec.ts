import execa from "execa";
import log from "./logger";

export interface ExecOptions {
  input?: string;
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
  detached?: boolean;  // Add detached option for Windows
  windowsHide?: boolean;  // Hide console window on Windows
}

export interface ExecResult {
  stdout: string;
  stderr: string;
}

/**
 * Wrapper around execa with logging and error handling
 * 
 * @param bin - Command to execute
 * @param args - Command arguments
 * @param options - Execution options
 * @returns Promise resolving to stdout and stderr
 * @throws Error with command context on failure
 */
export async function runCommand(
  bin: string,
  args: string[],
  options?: ExecOptions
): Promise<ExecResult> {
  const commandStr = `${bin} ${args.join(" ")}`;
  log.debug(`[exec] Running: ${commandStr}`);
  
  try {
    const result = await execa(bin, args, {
      input: options?.input,
      timeout: options?.timeout,
      cwd: options?.cwd,
      env: { ...process.env, ...options?.env },  // Merge with process env
      detached: options?.detached,
      windowsHide: options?.windowsHide ?? true,  // Hide window by default on Windows
      reject: false, // Let caller handle non-zero exit codes
    });
    
    // Log stdout (truncated to avoid flooding logs)
    const stdoutLog = result.stdout.length > 500 
      ? result.stdout.substring(0, 500) + "..." 
      : result.stdout;
    log.debug(`[exec] stdout: ${stdoutLog}`);
    
    if (result.stderr) {
      const stderrLog = result.stderr.length > 500 
        ? result.stderr.substring(0, 500) + "..." 
        : result.stderr;
      log.debug(`[exec] stderr: ${stderrLog}`);
    }
    
    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const enhancedError = new Error(`Command failed: ${commandStr}\nError: ${errorMessage}`);
    log.error(`[exec] ${enhancedError.message}`);
    throw enhancedError;
  }
}
