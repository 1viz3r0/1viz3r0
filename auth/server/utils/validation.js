const validator = require('validator');

exports.validateEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return { valid: false, message: 'Email is required' };
  }
  
  if (!validator.isEmail(email)) {
    return { valid: false, message: 'Invalid email format' };
  }
  
  if (email.length > 255) {
    return { valid: false, message: 'Email too long' };
  }
  
  return { valid: true };
};

exports.validatePassword = (password) => {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required' };
  }
  
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }
  
  if (password.length > 128) {
    return { valid: false, message: 'Password too long' };
  }
  
  return { valid: true };
};

exports.validatePhone = (phone) => {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, message: 'Phone number is required' };
  }
  
  if (!validator.isMobilePhone(phone, 'any')) {
    return { valid: false, message: 'Invalid phone number format' };
  }
  
  return { valid: true };
};

exports.validateURL = (url) => {
  if (!url || typeof url !== 'string') {
    return { valid: false, message: 'URL is required' };
  }
  
  // Check for browser internal URLs that can't be scanned
  if (url.startsWith('chrome://') || 
      url.startsWith('chrome-extension://') ||
      url.startsWith('moz-extension://') ||
      url.startsWith('edge://') ||
      url.startsWith('about:') ||
      url.startsWith('file://')) {
    return { valid: false, message: 'Cannot scan browser internal pages or local files. Please navigate to a regular web page (http:// or https://)' };
  }
  
  // Normalize URL - add https:// if no protocol
  let normalizedUrl = url.trim();
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = 'https://' + normalizedUrl;
  }
  
  // Validate the normalized URL
  if (!validator.isURL(normalizedUrl, { protocols: ['http', 'https'], require_protocol: true })) {
    return { valid: false, message: `Invalid URL format: ${url}. URL must be a valid http:// or https:// address` };
  }
  
  return { valid: true, normalizedUrl };
};