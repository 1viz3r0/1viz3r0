/**
 * Test Script for Module A - Registration Flow
 * 
 * Simple test script to verify registration endpoints
 * 
 * Usage:
 * 1. Start your server
 * 2. Set up MongoDB connection
 * 3. Run: node test-auth-register.js
 * 
 * Note: This script tests the registration flow with placeholder email/SMS
 * In development mode, OTPs will be logged to console
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:5000/api/auth';

async function testRegistration() {
  console.log('🧪 Testing Registration Flow...\n');

  try {
    // Step 1: Register
    console.log('1️⃣ Registering user...');
    const registerResponse = await axios.post(`${BASE_URL}/register`, {
      name: 'Test User',
      email: 'test@example.com',
      phone: '+1234567890',
      password: 'testpassword123'
    });

    console.log('✅ Registration initiated:', registerResponse.data);
    const { sessionId, devEmailOTP } = registerResponse.data;

    if (!sessionId) {
      console.error('❌ No sessionId received');
      return;
    }

    // Step 2: Verify Email OTP
    console.log('\n2️⃣ Verifying Email OTP...');
    const emailOTP = devEmailOTP || '123456'; // Use dev OTP if available
    console.log(`   Using OTP: ${emailOTP}`);

    const emailVerifyResponse = await axios.post(`${BASE_URL}/verify-email-otp`, {
      sessionId,
      otp: emailOTP
    });

    console.log('✅ Email OTP verified:', emailVerifyResponse.data);

    // Step 3: Verify Mobile OTP
    console.log('\n3️⃣ Verifying Mobile OTP...');
    const mobileOTP = '123456'; // In dev mode, any 6-digit code should work
    console.log(`   Using OTP: ${mobileOTP}`);

    const mobileVerifyResponse = await axios.post(`${BASE_URL}/verify-mobile-otp`, {
      sessionId,
      otp: mobileOTP
    });

    console.log('✅ Mobile OTP verified:', mobileVerifyResponse.data);
    console.log('\n✅ Registration flow completed successfully!');
    console.log('\n📋 User created:');
    console.log(JSON.stringify(mobileVerifyResponse.data.user, null, 2));

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Run test
testRegistration();

