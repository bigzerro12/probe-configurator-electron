import log from "electron-log";

/**
 * Configures electron-log for the main process
 */
function configureLogger(): void {
  log.transports.file.level = "info";
  log.transports.console.level = "debug";
  
  // Set log file location (optional - electron-log handles this automatically)
  // log.transports.file.fileName = "probe-configurator.log";
}

configureLogger();

export default log;
