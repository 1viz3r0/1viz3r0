const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Twilio Verify Service SID
const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID || 'YOUR_TWILIO_VERIFY_SERVICE_SID';

/**
 * Send OTP via Twilio Verify API
 * @param {string} phone - Phone number in E.164 format (e.g., +1234567890)
 * @param {string} otp - OTP code (optional - Twilio Verify generates its own)
 * @returns {Promise<{success: boolean, sid?: string, error?: string}>}
 */
exports.sendOTPSMS = async (phone, otp = null) => {
  try {
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
      // Note: Twilio Verify generates its own code, so we don't return the OTP
      message: 'Verification code sent successfully'
    };
  } catch (error) {
    console.error('❌ Twilio Verify error:', error.message);
    console.error('   Error code:', error.code);
    console.error('   More info:', error.moreInfo);
    
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
exports.verifyOTPSMS = async (phone, code) => {
  try {
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
    
    let errorMessage = error.message;
    
    if (error.code === 20404) {
      errorMessage = 'Verification code expired or not found. Please request a new code.';
    } else if (error.code === 60202) {
      errorMessage = 'Too many verification attempts. Please request a new code.';
    }
    
    return { success: false, valid: false, error: errorMessage, code: error.code };
  }
};