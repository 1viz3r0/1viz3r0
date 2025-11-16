const axios = require('axios');
const crypto = require('crypto');
const FormData = require('form-data');

// MetaDefender Cloud API configuration
const METADEFENDER_API_KEY = process.env.METADEFENDER_API_KEY;
const METADEFENDER_API_URL = process.env.METADEFENDER_API_URL || 'https://api.metadefender.com/v4';

// Cache for scan results (by file hash)
const scanCache = new Map();
const CACHE_TTL = 3600000; // 1 hour cache

// Maximum file size to scan (100MB)
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// Timeout configuration (adaptive based on file size)
const BASE_DOWNLOAD_TIMEOUT = 30000; // 30 seconds base timeout
const BASE_UPLOAD_TIMEOUT = 30000; // 30 seconds base timeout
const BASE_SCAN_WAIT_TIME = 60000; // 60 seconds base wait time for scan results
const TIMEOUT_PER_MB = 2000; // Add 2 seconds per MB of file size

/**
 * Compute file hash (SHA256) from stream
 * @param {Buffer} buffer - File buffer
 * @returns {string} SHA256 hash
 */
function computeFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Upload file to MetaDefender Cloud for scanning
 * @param {Buffer} fileBuffer - File data as buffer
 * @param {string} fileName - Name of the file
 * @returns {Promise<Object>} Scan result
 */
async function scanFileWithMetaDefender(fileBuffer, fileName) {
  if (!METADEFENDER_API_KEY) {
    throw new Error('MetaDefender API key not configured');
  }

  // Check file size
  if (fileBuffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size (${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB) exceeds maximum scan size (${MAX_FILE_SIZE / 1024 / 1024}MB)`);
  }

  // Compute file hash for caching
  const fileHash = computeFileHash(fileBuffer);
  
  // Check cache first
  const cached = scanCache.get(fileHash);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`📋 MetaDefender scan result from cache: ${fileName}`);
    return cached.result;
  }

  // Calculate adaptive timeouts based on file size
  const fileSizeMB = fileBuffer.length / (1024 * 1024);
  const uploadTimeout = BASE_UPLOAD_TIMEOUT + (fileSizeMB * TIMEOUT_PER_MB);
  const scanWaitTime = BASE_SCAN_WAIT_TIME + (fileSizeMB * TIMEOUT_PER_MB * 2); // Longer wait for larger files
  
  console.log(`📊 File size: ${fileSizeMB.toFixed(2)}MB, Upload timeout: ${(uploadTimeout / 1000).toFixed(1)}s, Scan wait: ${(scanWaitTime / 1000).toFixed(1)}s`);

  try {
    console.log(`🔍 Uploading file to MetaDefender Cloud for scanning: ${fileName} (${fileSizeMB.toFixed(2)}MB)`);
    
    // Create form data
    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: fileName,
      contentType: 'application/octet-stream'
    });

    // Upload file to MetaDefender Cloud API v4
    // Endpoint: POST /file (uploads file and starts scan)
    const uploadResponse = await axios.post(`${METADEFENDER_API_URL}/file`, formData, {
      headers: {
        'apikey': METADEFENDER_API_KEY,
        ...formData.getHeaders()
      },
      timeout: uploadTimeout, // Adaptive timeout based on file size
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      validateStatus: (status) => status >= 200 && status < 300
    });

    // MetaDefender API response format
    // Response can be: { data_id: "..." } or nested in data property
    let dataId = uploadResponse.data?.data_id || 
                 uploadResponse.data?.data?.data_id ||
                 uploadResponse.data?.scan_id;
    
    if (!dataId) {
      console.error('❌ MetaDefender upload response:', JSON.stringify(uploadResponse.data, null, 2));
      throw new Error('No data_id returned from MetaDefender - check API response format and API key');
    }

    console.log(`✅ File uploaded to MetaDefender, data_id: ${dataId}`);
    console.log(`⏳ Polling for scan results (max wait: ${(scanWaitTime / 1000).toFixed(1)}s)...`);

    // Poll for scan results (MetaDefender scans files asynchronously)
    // Optimize polling: start with fast polls, then slow down
    const maxWaitTime = scanWaitTime; // Adaptive timeout based on file size
    const startTime = Date.now();
    let pollInterval = 200; // Start with 200ms polls for fast response
    let pollCount = 0;
    
    while (Date.now() - startTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      pollCount++;
      
      // Gradually increase poll interval (exponential backoff)
      if (pollCount > 10) {
        pollInterval = 500; // 500ms after 10 polls
      }
      if (pollCount > 20) {
        pollInterval = 1000; // 1s after 20 polls
      }
      
      try {
        const resultResponse = await axios.get(`${METADEFENDER_API_URL}/file/${dataId}`, {
          headers: {
            'apikey': METADEFENDER_API_KEY
          },
          timeout: 10000
        });

        const scanResult = resultResponse.data;
        
        // MetaDefender API response format
        // Check scan progress - can be in progress_percentage or scan_results.progress_percentage
        const scanProgress = scanResult.scan_results?.progress_percentage || 
                            scanResult.process_info?.progress_percentage || 
                            (scanResult.scan_results ? 100 : 0);
        
        if (pollCount % 5 === 0) { // Log every 5th poll to reduce noise
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`📊 Scan progress: ${scanProgress}% (${pollCount} polls, ${elapsed}s elapsed)`);
        }

        // Check if scan is complete
        // Scan is complete when progress_percentage === 100 OR scan_results exists with scan_all_result_i
        const scanResults = scanResult.scan_results;
        const isComplete = scanProgress === 100 || 
                          (scanResults && scanResults.scan_all_result_i !== undefined);
        
        if (isComplete && scanResults) {
          // Scan complete, analyze results

          // Check scan status
          const scanStatus = scanResults.scan_all_result_i || 0;
          const totalAvEngines = scanResults.total_av_engines || 0;
          const totalDetected = scanResults.total_detected_av || 0;

          console.log(`✅ Scan completed: ${totalDetected}/${totalAvEngines} engines detected threats`);

          // Extract threats
          const threats = [];
          if (scanResults.scan_details) {
            Object.keys(scanResults.scan_details).forEach(engine => {
              const detail = scanResults.scan_details[engine];
              if (detail.threat_found) {
                threats.push(`${engine}: ${detail.threat_found}`);
              }
            });
          }

          // Determine result
          // Only treat as infected if totalDetected > 0
          // scanStatus (scan_all_result_i) can be non-zero in some edge cases even when no threats are detected
          let status, isInfected, message;
          if (totalDetected > 0) {
            // Threat detected - only if engines actually detected threats
            status = 'infected';
            isInfected = true;
            message = `Threat detected by ${totalDetected} out of ${totalAvEngines} engines`;
          } else {
            // No threat detected
            status = 'clean';
            isInfected = false;
            message = `No threats detected (scanned by ${totalAvEngines} engines)`;
          }

          const result = {
            status: status,
            isInfected: isInfected,
            threats: threats.length > 0 ? threats : (isInfected ? ['Unknown threat'] : null),
            message: message,
            scanId: dataId,
            totalEngines: totalAvEngines,
            detectedEngines: totalDetected,
            fileHash: fileHash
          };

          // Cache the result
          scanCache.set(fileHash, {
            result: result,
            timestamp: Date.now()
          });

          console.log(`✅ MetaDefender scan result: ${status.toUpperCase()}`);
          if (isInfected) {
            console.log(`🚫 Threats: ${threats.slice(0, 3).join(', ')}${threats.length > 3 ? '...' : ''}`);
          }

          return result;
        }
      } catch (pollError) {
        // If it's a 404, scan might still be in progress
        if (pollError.response?.status === 404) {
          continue;
        }
        throw pollError;
      }
    }

    // Timeout - scan took too long
    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
    throw new Error(`MetaDefender scan timeout - scan took longer than ${(maxWaitTime / 1000).toFixed(1)} seconds (waited ${elapsedSeconds}s). The file may be large or MetaDefender is processing slowly.`);
  } catch (error) {
    console.error(`❌ MetaDefender scan error:`, error.message);
    throw error;
  }
}

/**
 * Scan file from URL using MetaDefender Cloud
 * @param {string} fileUrl - URL of the file to scan
 * @param {string} fileName - Name of the file
 * @returns {Promise<Object>} Scan result
 */
async function scanFileFromURL(fileUrl, fileName) {
  try {
    console.log(`📥 Downloading file for MetaDefender scan: ${fileName}`);
    console.log(`   URL: ${fileUrl.substring(0, 80)}...`);

    // Try to get content-length from HEAD request to estimate file size and timeout
    let estimatedSize = 0;
    let downloadTimeout = BASE_DOWNLOAD_TIMEOUT;
    
    try {
      const headResponse = await axios.head(fileUrl, {
        timeout: 5000,
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 400
      });
      
      const contentLength = headResponse.headers['content-length'];
      if (contentLength) {
        estimatedSize = parseInt(contentLength, 10);
        const estimatedSizeMB = estimatedSize / (1024 * 1024);
        downloadTimeout = BASE_DOWNLOAD_TIMEOUT + (estimatedSizeMB * TIMEOUT_PER_MB);
        console.log(`📊 Estimated file size: ${estimatedSizeMB.toFixed(2)}MB, Download timeout: ${(downloadTimeout / 1000).toFixed(1)}s`);
      }
    } catch (headError) {
      // HEAD request failed, use default timeout
      console.log(`⚠️ Could not determine file size from HEAD request, using default timeout`);
    }

    // Download file with adaptive timeout and size limit
    const downloadResponse = await axios({
      method: 'GET',
      url: fileUrl,
      responseType: 'arraybuffer',
      timeout: downloadTimeout, // Adaptive timeout based on estimated file size
      maxContentLength: MAX_FILE_SIZE,
      maxBodyLength: MAX_FILE_SIZE,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400
    });

    const fileBuffer = Buffer.from(downloadResponse.data);
    const fileSizeMB = fileBuffer.length / (1024 * 1024);

    console.log(`✅ File downloaded: ${fileSizeMB.toFixed(2)}MB`);

    // Scan with MetaDefender
    return await scanFileWithMetaDefender(fileBuffer, fileName);
  } catch (error) {
    console.error(`❌ Error scanning file from URL:`, error.message);
    
    if (error.response?.status === 413 || error.message?.includes('maxContentLength')) {
      throw new Error(`File size exceeds maximum scan size (${MAX_FILE_SIZE / 1024 / 1024}MB)`);
    }
    
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      throw new Error('File download or scan timeout');
    }
    
    throw error;
  }
}

/**
 * Scan file stream using MetaDefender Cloud
 * @param {ReadableStream} stream - File stream
 * @param {string} fileName - Name of the file
 * @returns {Promise<Object>} Scan result
 */
async function scanFileStream(stream, fileName) {
  return new Promise(async (resolve, reject) => {
    try {
      const chunks = [];
      let totalBytes = 0;

      stream.on('data', (chunk) => {
        chunks.push(chunk);
        totalBytes += chunk.length;
        
        if (totalBytes > MAX_FILE_SIZE) {
          stream.destroy();
          reject(new Error(`File size exceeds maximum scan size (${MAX_FILE_SIZE / 1024 / 1024}MB)`));
        }
      });

      stream.on('end', async () => {
        try {
          const fileBuffer = Buffer.concat(chunks);
          console.log(`✅ Stream collected: ${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB`);
          
          const result = await scanFileWithMetaDefender(fileBuffer, fileName);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      stream.on('error', (error) => {
        reject(new Error(`Stream error: ${error.message}`));
      });
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  scanFileFromURL,
  scanFileStream,
  scanFileWithMetaDefender,
  computeFileHash
};

