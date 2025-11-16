/**
 * SMS Utility (Placeholder)
 * 
 * Extracted from auth/server/utils/sms.js
 * 
 * TODO: Wire up your SMS service provider
 * 
 * Currently uses Twilio Verify API for SMS OTP verification:
 * - TWILIO_ACCOUNT_SID
 * - TWILIO_AUTH_TOKEN
 * - TWILIO_VERIFY_SERVICE_SID
 * 
 * For Twilio:
 * 1. Sign up at https://www.twilio.com
 * 2. Create a Verify Service in Twilio Console
 * 3. Get your Account SID, Auth Token, and Verify Service SID
 * 4. Set them in your .env file
 * 
 * Alternatively, you can replace this with:
 * - AWS SNS
 * - Vonage (Nexmo)
 * - MessageBird
 * - Or any other SMS service
 */

const twilio = require('twilio');

// Initialize Twilio client only if credentials are available
let client = null;
let VERIFY_SERVICE_SID = null;

try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID || 'YOUR_TWILIO_VERIFY_SERVICE_SID';
    
    if (VERIFY_SERVICE_SID === 'YOUR_TWILIO_VERIFY_SERVICE_SID') {
      console.warn('⚠️  TWILIO_VERIFY_SERVICE_SID not configured. SMS verification will not work.');
    }
  } else {
    console.warn('⚠️  Twilio credentials not configured. SMS verification will use placeholder.');
  }
} catch (error) {
  console.error('❌ Failed to initialize Twilio client:', error.message);
}

/**
 * Send OTP via SMS using Twilio Verify API
 * @param {string} phone - Phone number in E.164 format (e.g., +1234567890)
 * @returns {Promise<{success: boolean, sid?: string, error?: string}>}
 */
exports.sendSMS = async (phone) => {
  try {
    // If Twilio is not configured, return placeholder response in dev mode
    if (!client || !VERIFY_SERVICE_SID || VERIFY_SERVICE_SID === 'YOUR_TWILIO_VERIFY_SERVICE_SID') {
      if (process.env.NODE_ENV === 'development') {
        console.log('📱 [DEV MODE] SMS OTP would be sent to:', phone);
        console.log('   → Configure Twilio in .env to enable real SMS sending');
        return { 
          success: true, 
          sid: 'dev-mode',
          status: 'pending',
          message: 'SMS sent (dev mode - Twilio not configured)'
        };
      }
      return { 
        success: false, 
        error: 'SMS service not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID in .env' 
      };
    }

    // Validate phone number format
    if (!phone || !phone.startsWith('+')) {
      console.error('❌ Invalid phone number format. Must be in E.164 format (e.g., +1234567890)');
      return { success: false, error: 'Invalid phone number format. Must include country code (e.g., +1234567890)' };
    }

    // Use Twilio Verify API to send verification code
    const verification = await client.verify.v2
      .services(VERIFY_SERVICE_SID)
      .verifications
      .create({
        to: phone,
        channel: 'sms'
      });

    console.log('✅ SMS verification sent via Twilio Verify:', verification.sid);
    console.log('   Phone:', phone);
    console.log('   Status:', verification.status);
    
    return { 
      success: true, 
      sid: verification.sid,
      status: verification.status,
      message: 'Verification code sent successfully'
    };
  } catch (error) {
    console.error('❌ Twilio Verify error:', error.message);
    console.error('   Error code:', error.code);
    console.error('   More info:', error.moreInfo);
    
    // In development, still return success with placeholder
    if (process.env.NODE_ENV === 'development') {
      console.log('📱 [DEV MODE] Twilio error, but continuing in dev mode');
      return { 
        success: true, 
        sid: 'dev-mode',
        error: error.message 
      };
    }
    
    let errorMessage = error.message;
    
    // Provide helpful error messages
    if (error.code === 60200) {
      errorMessage = 'Invalid phone number format';
    } else if (error.code === 60203) {
      errorMessage = 'Max send attempts reached. Please try again later.';
    } else if (error.code === 20429) {
      errorMessage = 'Too many requests. Please wait a moment and try again.';
    } else if (error.code === 20003) {
      errorMessage = 'Twilio authentication failed. Check your credentials.';
    }
    
    return { success: false, error: errorMessage, code: error.code };
  }
};

/**
 * Verify OTP code using Twilio Verify API
 * @param {string} phone - Phone number in E.164 format
 * @param {string} code - OTP code to verify
 * @returns {Promise<{success: boolean, valid: boolean, error?: string}>}
 */
exports.verifySMS = async (phone, code) => {
  try {
    // If Twilio is not configured, return placeholder response in dev mode
    if (!client || !VERIFY_SERVICE_SID || VERIFY_SERVICE_SID === 'YOUR_TWILIO_VERIFY_SERVICE_SID') {
      if (process.env.NODE_ENV === 'development') {
        console.log('📱 [DEV MODE] SMS OTP verification for:', phone, 'code:', code);
        console.log('   → Configure Twilio in .env to enable real SMS verification');
        // Accept any 6-digit code in dev mode
        if (code && code.length === 6 && /^\d{6}$/.test(code)) {
          return {
            success: true,
            valid: true,
            status: 'approved',
            message: 'Verification code is valid (dev mode)'
          };
        }
        return {
          success: true,
          valid: false,
          status: 'pending',
          message: 'Invalid verification code (dev mode)'
        };
      }
      return { 
        success: false, 
        valid: false, 
        error: 'SMS service not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID in .env' 
      };
    }

    // Validate inputs
    if (!phone || !phone.startsWith('+')) {
      return { success: false, valid: false, error: 'Invalid phone number format' };
    }
    
    if (!code || code.length < 4) {
      return { success: false, valid: false, error: 'Invalid verification code' };
    }

    // Verify the code using Twilio Verify API
    const verificationCheck = await client.verify.v2
      .services(VERIFY_SERVICE_SID)
      .verificationChecks
      .create({
        to: phone,
        code: code
      });

    console.log('🔍 Verification check result:', verificationCheck.status);
    console.log('   Phone:', phone);
    console.log('   Valid:', verificationCheck.status === 'approved');

    const isValid = verificationCheck.status === 'approved';
    
    return {
      success: true,
      valid: isValid,
      status: verificationCheck.status,
      sid: verificationCheck.sid,
      message: isValid ? 'Verification code is valid' : 'Invalid verification code'
    };
  } catch (error) {
    console.error('❌ Twilio Verify check error:', error.message);
    console.error('   Error code:', error.code);
    
    // In development, still allow verification with any 6-digit code
    if (process.env.NODE_ENV === 'development' && code && code.length === 6 && /^\d{6}$/.test(code)) {
      console.log('📱 [DEV MODE] Twilio error, but accepting code in dev mode');
      return {
        success: true,
        valid: true,
        status: 'approved',
        message: 'Verification code is valid (dev mode)'
      };
    }
    
    let errorMessage = error.message;
    
    if (error.code === 20404) {
      errorMessage = 'Verification code expired or not found. Please request a new code.';
    } else if (error.code === 60202) {
      errorMessage = 'Too many verification attempts. Please request a new code.';
    }
    
    return { success: false, valid: false, error: errorMessage, code: error.code };
  }
};

// Aliases for backward compatibility
exports.sendOTPSMS = exports.sendSMS;
exports.verifyOTPSMS = exports.verifySMS;

