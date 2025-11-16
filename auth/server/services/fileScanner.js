const { checkURLReputation } = require('./urlReputation');
const { scanFileFromURL } = require('./metadefender');

/**
 * Scan file with multi-layer protection:
 * 1. VirusTotal URL reputation check (fast)
 * 2. MetaDefender Cloud scan (comprehensive)
 * @param {string} fileUrl - URL of the file to scan
 * @param {string} fileName - Name of the file
 * @returns {Promise<Object>} Scan result
 */
async function scanFile(fileUrl, fileName) {
  const scanStartTime = Date.now();
  
  try {
    console.log(`🔍 Starting cloud-based file scan: ${fileName}`);
    console.log(`   URL: ${fileUrl.substring(0, 80)}...`);

    // ========================================
    // STEP 1: VirusTotal URL Reputation Check (Fast - <800ms)
    // ========================================
    console.log(`📋 Step 1: Checking URL reputation with VirusTotal...`);
    const urlCheckStart = Date.now();
    const urlReputation = await checkURLReputation(fileUrl);
    const urlCheckDuration = Date.now() - urlCheckStart;
    console.log(`✅ URL reputation check completed in ${urlCheckDuration}ms`);
    
    if (urlReputation.isMalicious) {
      console.log(`🚫 BLOCKED: URL is known malicious`);
      console.log(`   Threats: ${urlReputation.threats?.join(', ') || 'Unknown threat'}`);
      console.log(`   Blocked in ${Date.now() - scanStartTime}ms (URL reputation check)`);
      
      return {
        status: 'infected',
        threats: urlReputation.threats || ['Known malicious URL'],
        message: urlReputation.message || 'Download URL is known malicious',
        blocked: true,
        blockedReason: 'url_reputation',
        scanDuration: Date.now() - scanStartTime
      };
    }

    // Log suspicious patterns but don't treat them as threats
    // Only actual malware detection (isMalicious) should be treated as a threat
    if (urlReputation.isSuspicious) {
      console.log(`⚠️ WARNING: URL matches suspicious patterns (not blocking, proceeding with scan)`);
      console.log(`   Reasons: ${urlReputation.suspiciousReasons?.join(', ') || 'Suspicious patterns detected'}`);
      // Continue with scan - don't block based on patterns alone
    }
    
    if (urlReputation.checked && !urlReputation.isMalicious) {
      console.log(`✅ URL is clean according to VirusTotal`);
    }

    // ========================================
    // STEP 2: MetaDefender Cloud Scan (<1.5s average)
    // ========================================
    console.log(`📋 Step 2: Scanning file with MetaDefender Cloud...`);
    const metaDefenderStart = Date.now();
    
    try {
      const metaDefenderResult = await scanFileFromURL(fileUrl, fileName);
      const metaDefenderDuration = Date.now() - metaDefenderStart;
      console.log(`✅ MetaDefender scan completed in ${metaDefenderDuration}ms`);
      
      const totalDuration = Date.now() - scanStartTime;
      console.log(`✅ Total scan completed in ${totalDuration}ms`);
      
      // Map MetaDefender result to our format
      if (metaDefenderResult.isInfected) {
        return {
          status: 'infected',
          threats: metaDefenderResult.threats || ['Unknown threat'],
          message: metaDefenderResult.message || 'File contains malware',
          scanDuration: totalDuration,
          scanId: metaDefenderResult.scanId,
          totalEngines: metaDefenderResult.totalEngines,
          detectedEngines: metaDefenderResult.detectedEngines,
          fileHash: metaDefenderResult.fileHash
        };
      } else {
        return {
          status: 'clean',
          threats: null,
          message: metaDefenderResult.message || 'File is safe',
          scanDuration: totalDuration,
          scanId: metaDefenderResult.scanId,
          totalEngines: metaDefenderResult.totalEngines,
          detectedEngines: metaDefenderResult.detectedEngines,
          fileHash: metaDefenderResult.fileHash
        };
      }
    } catch (metaDefenderError) {
      console.error(`❌ MetaDefender scan error:`, metaDefenderError.message);
      
      // If MetaDefender fails, return error but don't block
      // User can still decide to download
      return {
        status: 'error',
        threats: null,
        error: metaDefenderError.message || 'Scan error',
        message: `Unable to scan file with MetaDefender: ${metaDefenderError.message || 'Scan service unavailable'}. You can still download, but file safety cannot be verified.`,
        scanDuration: Date.now() - scanStartTime
      };
    }
  } catch (error) {
    console.error(`❌ File scan error:`, error.message);
    return {
      status: 'error',
      threats: null,
      error: error.message || 'Scan error',
      message: `Unable to scan file: ${error.message || 'Scan service unavailable'}. You can still download, but file safety cannot be verified.`,
      scanDuration: Date.now() - scanStartTime
    };
  }
}

module.exports = {
  scanFile
};

