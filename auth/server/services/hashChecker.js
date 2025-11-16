// Hash checking service - DEPRECATED
// File hash checking has been removed in favor of cloud-based scanning
// This file is kept for backward compatibility but is no longer used
// All file scanning now uses MetaDefender Cloud API via fileScanner.js

// Note: URL reputation checking is handled in urlReputation.js
// File scanning is handled in metadefender.js via fileScanner.js

module.exports = {
  // Placeholder exports for backward compatibility
  checkFileHash: async () => {
    console.log('ℹ️ Hash checking is deprecated - using cloud-based scanning instead');
    return {
      checked: false,
      isMalicious: false,
      threats: null,
      message: 'Hash checking deprecated - using MetaDefender Cloud scanning'
    };
  }
};
