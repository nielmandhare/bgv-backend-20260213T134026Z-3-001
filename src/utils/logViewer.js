const fs = require('fs');
const path = require('path');

class LogViewer {
  constructor() {
    this.logDir = path.join(process.cwd(), 'logs');
  }

  // Get today's log file
  getTodayLog() {
    const date = new Date().toISOString().split('T')[0];
    const filepath = path.join(this.logDir, `${date}.log`);
    
    if (fs.existsSync(filepath)) {
      return fs.readFileSync(filepath, 'utf8');
    }
    return 'No logs for today';
  }

  // Get logs by date
  getLogByDate(date) {
    const filepath = path.join(this.logDir, `${date}.log`);
    
    if (fs.existsSync(filepath)) {
      return fs.readFileSync(filepath, 'utf8');
    }
    return `No logs for ${date}`;
  }

  // Get error logs
  getErrorLogs() {
    const filepath = path.join(this.logDir, 'error.log');
    
    if (fs.existsSync(filepath)) {
      return fs.readFileSync(filepath, 'utf8');
    }
    return 'No error logs';
  }

  // Get recent logs (last N lines)
  getRecentLogs(lines = 100) {
    const logFile = this.getTodayLog();
    const logLines = logFile.split('\n');
    return logLines.slice(-lines).join('\n');
  }
}

module.exports = new LogViewer();
