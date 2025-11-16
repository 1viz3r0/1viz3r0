const express = require('express');
const { protect } = require('../middleware/auth');
const Log = require('../models/log');
const { scanWebPage, getScanResults } = require('../services/zapScanner');
const { scanFile } = require('../services/fileScanner');
const { validateURL } = require('../utils/validation');

const router = express.Router();

// POST /api/scan/page - Scan a web page
router.post('/page', protect, async (req, res, next) => {
  try {
    const { url } = req.body;

    // Validate URL
    const urlValidation = validateURL(url);
    if (!urlValidation.valid) {
      // Create a log entry for invalid URLs (mark as unsafe)
      try {
        const invalidUrlLog = new Log({
          userId: req.user._id,
          type: 'pages',
          result: 'unsafe',
          threatLevel: 'high',
          source: url,
          details: {
            reason: 'Invalid URL format',
            message: urlValidation.message,
            scannedAt: new Date()
          }
        });
        await invalidUrlLog.save();
        console.log(`⚠️ Logged invalid URL as unsafe: ${url}`);
      } catch (logError) {
        console.error('Failed to create log for invalid URL:', logError);
      }
      
      return res.status(400).json({ 
        success: false, 
        message: urlValidation.message,
        logged: true // Indicate that a log was created
      });
    }

    // Use normalized URL if available
    const targetUrl = urlValidation.normalizedUrl || url;
    console.log(`Scanning page: ${targetUrl} (original: ${url})`);

    // Initiate ZAP scan - this starts the scan and returns immediately with scanId
    // The scan continues in the background and logs are created automatically
    let scanId = null;
    try {
      const scanResult = await scanWebPage(targetUrl, req.user._id);
      scanId = scanResult.scanId;
      console.log(`✅ Scan initiated for ${targetUrl}, scanId: ${scanId}`);
    } catch (error) {
      console.error(`❌ Failed to initiate scan for ${targetUrl}:`, error);
      // Return error response
      return res.status(500).json({
        success: false,
        message: `Failed to initiate scan: ${error.message}`
      });
    }

    // Return immediately with scan initiated status
    res.status(200).json({
      success: true,
      message: 'Scan initiated. Use /api/scan/status to check progress.',
      url: targetUrl,
      scanId: scanId || undefined
    });
  } catch (error) {
    console.error('Error initiating scan:', error);
    next(error);
  }
});

// GET /api/scan/status - Get scan status
router.get('/status', protect, async (req, res, next) => {
  try {
    const { scanId } = req.query;

    // If scanId provided, get specific scan results
    if (scanId) {
      const results = await getScanResults(scanId);
      return res.status(200).json({
        success: true,
        data: results
      });
    }

    // If no scanId, get latest scan for user from logs
    const latestLog = await Log.findOne({
      userId: req.user._id,
      type: 'pages'
    }).sort({ createdAt: -1 });

    if (!latestLog) {
      return res.status(200).json({
        success: true,
        data: {
          status: 'safe',
          critical: 0,
          high: 0,
          medium: 0,
          low: 0
        }
      });
    }

    // If log has scanId, try to get detailed results from ZAP
    if (latestLog.details?.scanId) {
      try {
        const results = await getScanResults(latestLog.details.scanId);
        // If we got valid results from ZAP, return them
        if (results && results.status) {
          return res.status(200).json({
            success: true,
            data: results
          });
        }
      } catch (error) {
        console.error('Error getting scan results from ZAP:', error.message);
        // Fall through to return log data
      }
    }

    // Return log data (either no scanId or ZAP results unavailable)
    const threatCounts = latestLog.details?.alerts || {};
    
    // Extract threat counts from log details
    // If threatCounts is an object with the counts, use it directly
    // Otherwise, infer from threatLevel (for backward compatibility)
    const critical = typeof threatCounts === 'object' && threatCounts.critical !== undefined 
      ? threatCounts.critical 
      : (latestLog.threatLevel === 'critical' ? 1 : 0);
    const high = typeof threatCounts === 'object' && threatCounts.high !== undefined 
      ? threatCounts.high 
      : (latestLog.threatLevel === 'high' ? 1 : 0);
    const medium = typeof threatCounts === 'object' && threatCounts.medium !== undefined 
      ? threatCounts.medium 
      : (latestLog.threatLevel === 'medium' ? 1 : 0);
    const low = typeof threatCounts === 'object' && threatCounts.low !== undefined 
      ? threatCounts.low 
      : (latestLog.threatLevel === 'low' ? 1 : 0);
    
    // Determine status based on actual threat counts
    // Unsafe ONLY if critical or high threats exist
    // Medium and low threats are considered safe (often false positives)
    const calculatedStatus = (critical > 0 || high > 0) ? 'unsafe' : 'safe';
    
    res.status(200).json({
      success: true,
      data: {
        status: calculatedStatus,
        critical: critical,
        high: high,
        medium: medium,
        low: low
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/scan/download - Scan a downloaded file with cloud APIs (VirusTotal + MetaDefender)
router.post('/download', protect, async (req, res, next) => {
  try {
    const { fileUrl, fileName } = req.body;

    // Validate request body with detailed error messages
    console.log('📥 Download scan request received:', {
      hasFileUrl: !!fileUrl,
      hasFileName: !!fileName,
      fileUrlLength: fileUrl ? fileUrl.length : 0,
      fileNameLength: fileName ? fileName.length : 0,
      fileUrlPreview: fileUrl ? fileUrl.substring(0, 50) : 'null',
      fileNamePreview: fileName ? fileName.substring(0, 50) : 'null'
    });

    if (!fileUrl || typeof fileUrl !== 'string') {
      console.error('❌ Download scan request missing or invalid fileUrl:', {
        fileUrl: fileUrl,
        type: typeof fileUrl,
        body: req.body
      });
      return res.status(400).json({ 
        success: false, 
        message: 'File URL is required and must be a string',
        received: { 
          fileUrl: !!fileUrl, 
          fileUrlType: typeof fileUrl,
          fileName: !!fileName,
          fileNameType: typeof fileName
        },
        bodyKeys: Object.keys(req.body)
      });
    }

    // Validate and extract filename
    let validFileName = fileName;
    
    if (!validFileName || typeof validFileName !== 'string' || validFileName.trim() === '') {
      console.warn('⚠️ Download scan request missing fileName, extracting from URL');
      
      // Try to extract filename from URL as fallback
      try {
        const urlObj = new URL(fileUrl);
        const urlPath = urlObj.pathname;
        let extractedFileName = urlPath.split('/').pop() || 'download';
        
        // Try to decode URL-encoded filename
        try {
          extractedFileName = decodeURIComponent(extractedFileName);
        } catch (decodeError) {
          // If decoding fails, use the encoded version
          console.warn('⚠️ Could not decode filename from URL, using encoded version');
        }
        
        // Remove query parameters and hash from filename
        extractedFileName = extractedFileName.split('?')[0].split('#')[0];
        
        // If still no valid filename, generate one with extension if possible
        if (!extractedFileName || extractedFileName === 'download' || extractedFileName.trim() === '') {
          // Try to get extension from URL path
          const extension = urlPath.match(/\.[a-zA-Z0-9]+$/)?.[0] || '';
          validFileName = `download_${Date.now()}${extension}`;
        } else {
          validFileName = extractedFileName;
        }
        
        console.log('✅ Extracted filename from URL:', validFileName);
      } catch (urlError) {
        console.error('❌ Could not extract filename from URL:', urlError);
        // Generate a generic filename as last resort
        validFileName = `download_${Date.now()}.bin`;
        console.log('📋 Using generated filename:', validFileName);
      }
    } else {
      // Clean up filename - remove path separators if it's a full path
      validFileName = validFileName.replace(/\\/g, '/').split('/').pop();
      
      // Remove query parameters and hash from filename
      validFileName = validFileName.split('?')[0].split('#')[0];
    }

    // Sanitize filename - remove invalid characters
    validFileName = validFileName.replace(/[<>:"|?*\x00-\x1f]/g, '_').trim();
    
    // Limit filename length (max 255 chars, but keep extension)
    if (validFileName.length > 255) {
      const lastDot = validFileName.lastIndexOf('.');
      if (lastDot > 0) {
        const ext = validFileName.substring(lastDot);
        const name = validFileName.substring(0, 255 - ext.length);
        validFileName = name + ext;
      } else {
        validFileName = validFileName.substring(0, 255);
      }
    }
    
    // Ensure filename is not empty
    if (!validFileName || validFileName.trim() === '') {
      validFileName = `download_${Date.now()}.bin`;
    }
    
    console.log(`📋 Using filename for scan: ${validFileName}`);

    // Validate URL format
    if (!fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) {
      console.error('❌ Invalid file URL format:', fileUrl.substring(0, 100));
      return res.status(400).json({ 
        success: false, 
        message: 'File URL must be a valid HTTP/HTTPS URL',
        receivedUrl: fileUrl.substring(0, 100),
        urlType: typeof fileUrl
      });
    }
    
    // Validate URL is properly formatted
    try {
      new URL(fileUrl);
    } catch (urlError) {
      console.error('❌ Invalid URL format:', urlError.message);
      return res.status(400).json({
        success: false,
        message: 'File URL is not a valid URL format',
        error: urlError.message,
        receivedUrl: fileUrl.substring(0, 100)
      });
    }
    
    // Check if this is an intermediate HTML/text file (download page, redirect, etc.)
    // These should be allowed without scanning, as they're not the actual files
    const isIntermediateFile = (() => {
      const lowerFileName = validFileName.toLowerCase();
      const lowerUrl = fileUrl.toLowerCase();
      
      // Check filename patterns for intermediate pages
      const intermediatePatterns = [
        'download.htm', 'download.html', 'download.php', 'download.asp', 'download.aspx',
        'download.jsp', 'download.cgi', 'file.htm', 'file.html', 'redirect.htm', 'redirect.html',
        'link.htm', 'link.html', 'getfile.htm', 'getfile.html', 'getdownload.htm', 'getdownload.html'
      ];
      
      // Check if filename matches intermediate patterns
      if (intermediatePatterns.some(pattern => lowerFileName.includes(pattern))) {
        return true;
      }
      
      // Check if it's a generic HTML file from a download URL
      if ((lowerFileName.endsWith('.htm') || lowerFileName.endsWith('.html')) &&
          (lowerFileName === 'download' || 
           lowerFileName === 'file' ||
           lowerUrl.includes('/download') ||
           lowerUrl.includes('/getfile') ||
           lowerUrl.includes('/redirect'))) {
        return true;
      }
      
      return false;
    })();
    
    if (isIntermediateFile) {
      console.log('⚠️ Intermediate file detected (download page), allowing without scan:', validFileName);
      // Allow intermediate files without scanning - they're just download pages
      // The actual file download will be scanned separately
      return res.status(200).json({
        success: true,
        status: 'clean',
        message: 'Intermediate file (download page) - no scan needed',
        fileName: validFileName,
        isIntermediate: true
      });
    }

    console.log(`🔍 Scanning file with cloud APIs: ${validFileName} from ${fileUrl.substring(0, 100)}...`);
    console.log(`   Step 1: VirusTotal URL reputation check`);
    console.log(`   Step 2: MetaDefender Cloud scan`);

    // Cloud-based scanning flow:
    // 1. VirusTotal URL reputation check (<800ms)
    // 2. MetaDefender Cloud scan (<1.5s)
    // 3. Return results to user for decision
    
    let scanResult;
    
    try {
      // Scan file with cloud APIs (VirusTotal + MetaDefender)
      scanResult = await scanFile(fileUrl, validFileName);
      
      const scanDuration = scanResult.scanDuration || 0;
      console.log(`✅ Scan completed in ${(scanDuration/1000).toFixed(2)}s - status: ${scanResult.status}`);
      
      if (scanResult.blocked) {
        console.log(`🚫 File blocked by: ${scanResult.blockedReason}`);
      }
    } catch (error) {
      console.error(`❌ Scan error:`, error.message);
      
      // On error, return error status - user will decide
      scanResult = {
        status: 'error',
        threats: null,
        error: error.message || 'Scan error',
        message: `Unable to scan file: ${error.message || 'Scan service unavailable'}. You can still download, but file safety cannot be verified.`,
        scanDuration: 0
      };
    }

    // Determine result and threat level for logging
    let logResult;
    let threatLevel = 'none';
    
    if (scanResult.status === 'infected') {
      threatLevel = 'high';
      logResult = 'infected';
    } else if (scanResult.status === 'clean' || scanResult.status === 'safe') {
      logResult = 'clean';
      threatLevel = 'none';
    } else {
      // Error or other status
      logResult = 'safe'; // Log as safe since we allow user to decide
      threatLevel = 'none';
    }

    // Save log to database
    try {
      await Log.create({
        userId: req.user._id,
        type: 'downloads',
        result: logResult,
        threatLevel: threatLevel,
        source: validFileName,
        details: {
          url: fileUrl,
          threats: scanResult.threats || null,
          error: scanResult.error || null,
          message: scanResult.message || null,
          scanStatus: scanResult.status
        }
      });
      console.log(`📝 Log saved for download scan: ${validFileName} (result: ${logResult})`);
    } catch (logError) {
      console.error('⚠️ Failed to save download scan log:', logError.message);
      // Continue even if log saving fails
    }

    // Return scan results - user will decide based on these results
    if (scanResult.status === 'infected') {
      // File is infected - inform user, they can still choose to download
      return res.status(200).json({
        success: true,
        status: 'infected',
        threats: scanResult.threats || ['Unknown threat'],
        message: scanResult.message || 'File contains malware',
        allowDownload: true // User decides - we inform but don't force block
      });
    } else if (scanResult.status === 'error') {
      // Scan error - inform user, they can decide
      return res.status(200).json({
        success: false,
        status: 'error',
        threats: null,
        error: scanResult.error || 'Scan error',
        message: scanResult.message || 'Unable to scan file. File safety cannot be verified.',
        allowDownload: true // User decides
      });
    } else {
      // File is clean or safe
      return res.status(200).json({
        success: true,
        status: scanResult.status || 'clean',
        threats: null,
        message: scanResult.message || 'File scanned and found to be safe',
        allowDownload: true // User decides
      });
    }
  } catch (error) {
    console.error('❌ Error in download scan endpoint:', error);
    next(error);
  }
});

module.exports = router;