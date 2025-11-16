// Filter list loader for ad blocking
// Fetches and converts filter lists (EasyList, EasyPrivacy) to declarativeNetRequest rules

const FILTER_LIST_URLS = {
  easylist: 'https://easylist.to/easylist/easylist.txt',
  easyprivacy: 'https://easylist.to/easylist/easyprivacy.txt',
  // Backup URLs
  easylist_backup: 'https://raw.githubusercontent.com/easylist/easylist/master/easylist/easylist.txt',
  easyprivacy_backup: 'https://raw.githubusercontent.com/easylist/easylist/master/easyprivacy/easyprivacy.txt'
};

// Parse filter list and convert to declarativeNetRequest rules
function parseFilterList(filterText) {
  const rules = [];
  const lines = filterText.split('\n');
  let ruleId = 1;

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip comments and empty lines
    if (!trimmedLine || trimmedLine.startsWith('!') || trimmedLine.startsWith('[')) {
      continue;
    }

    try {
      // Handle domain-based blocking (||domain.com^)
      if (trimmedLine.startsWith('||') && trimmedLine.includes('^')) {
        const domain = trimmedLine.match(/\|\|([^*^|]+)\^/)?.[1];
        if (domain && !domain.includes('*') && !domain.includes('|')) {
          // Skip YouTube video domains to prevent breaking playback
          if (domain.includes('googlevideo.com') || domain.includes('ytimg.com')) {
            continue;
          }
          
          rules.push({
            id: ruleId++,
            priority: 1,
            action: { type: 'block' },
            condition: {
              requestDomains: [domain],
              resourceTypes: [
                'script', 'image', 'stylesheet', 'xmlhttprequest',
                'sub_frame', 'media', 'websocket', 'font', 'object'
              ]
            }
          });
        }
      }
      // Handle simple domain blocking (domain.com)
      else if (!trimmedLine.includes('*') && !trimmedLine.includes('|') && !trimmedLine.includes('^') && trimmedLine.includes('.')) {
        const domain = trimmedLine.split('/')[0].trim();
        if (domain && domain.length > 3 && domain.includes('.')) {
          // Skip YouTube video domains
          if (domain.includes('googlevideo.com') || domain.includes('ytimg.com')) {
            continue;
          }
          
          rules.push({
            id: ruleId++,
            priority: 1,
            action: { type: 'block' },
            condition: {
              requestDomains: [domain],
              resourceTypes: [
                'script', 'image', 'stylesheet', 'xmlhttprequest',
                'sub_frame', 'media', 'websocket', 'font', 'object'
              ]
            }
          });
        }
      }
      // Handle URL pattern blocking (*/ads/*)
      else if (trimmedLine.includes('*') && !trimmedLine.includes('||')) {
        let pattern = trimmedLine;
        // Convert AdBlock pattern to declarativeNetRequest pattern
        pattern = pattern.replace(/\*/g, '*');
        pattern = pattern.replace(/\^/g, '');
        
        // Skip patterns that might break YouTube
        if (pattern.includes('googlevideo') || pattern.includes('ytimg')) {
          continue;
        }
        
        // Limit to common ad patterns to avoid too many rules
        if (pattern.includes('ad') || pattern.includes('track') || pattern.includes('analytics')) {
          rules.push({
            id: ruleId++,
            priority: 1,
            action: { type: 'block' },
            condition: {
              urlFilter: pattern,
              resourceTypes: ['script', 'image', 'xmlhttprequest', 'sub_frame']
            }
          });
        }
      }
    } catch (error) {
      // Skip invalid lines
      continue;
    }
  }

  return rules;
}

// Fetch filter list from URL
async function fetchFilterList(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch filter list: ${response.status}`);
    }
    const text = await response.text();
    return text;
  } catch (error) {
    console.error('Error fetching filter list:', error);
    throw error;
  }
}

// Load and apply filter lists
async function loadFilterLists() {
  try {
    console.log('🔄 Loading ad blocking filter lists...');
    
    // Try to fetch EasyList
    let easylistRules = [];
    try {
      const easylistText = await fetchFilterList(FILTER_LIST_URLS.easylist);
      easylistRules = parseFilterList(easylistText);
      console.log(`✅ Loaded ${easylistRules.length} rules from EasyList`);
    } catch (error) {
      console.warn('⚠️ Failed to load EasyList, using backup...');
      try {
        const easylistText = await fetchFilterList(FILTER_LIST_URLS.easylist_backup);
        easylistRules = parseFilterList(easylistText);
        console.log(`✅ Loaded ${easylistRules.length} rules from EasyList (backup)`);
      } catch (backupError) {
        console.error('❌ Failed to load EasyList from backup:', backupError);
      }
    }

    // Try to fetch EasyPrivacy
    let easyprivacyRules = [];
    try {
      const easyprivacyText = await fetchFilterList(FILTER_LIST_URLS.easyprivacy);
      easyprivacyRules = parseFilterList(easyprivacyText);
      console.log(`✅ Loaded ${easyprivacyRules.length} rules from EasyPrivacy`);
    } catch (error) {
      console.warn('⚠️ Failed to load EasyPrivacy, using backup...');
      try {
        const easyprivacyText = await fetchFilterList(FILTER_LIST_URLS.easyprivacy_backup);
        easyprivacyRules = parseFilterList(easyprivacyText);
        console.log(`✅ Loaded ${easyprivacyRules.length} rules from EasyPrivacy (backup)`);
      } catch (backupError) {
        console.error('❌ Failed to load EasyPrivacy from backup:', backupError);
      }
    }

    // Combine rules (limit to 30,000 to stay within Chrome's limit)
    const allRules = [...easylistRules, ...easyprivacyRules].slice(0, 30000);
    
    console.log(`📦 Total rules loaded: ${allRules.length}`);
    
    return allRules;
  } catch (error) {
    console.error('❌ Error loading filter lists:', error);
    return [];
  }
}

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { loadFilterLists, parseFilterList, fetchFilterList };
}

