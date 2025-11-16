const nodemailer = require('nodemailer');

// Validate email configuration
const validateEmailConfig = () => {
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    console.warn('⚠️  Email configuration incomplete. Check your .env file for EMAIL_HOST, EMAIL_USER, and EMAIL_PASSWORD');
    return false;
  }
  
  // Check if password is still placeholder
  if (process.env.EMAIL_PASSWORD === 'your-app-specific-password' || 
      process.env.EMAIL_PASSWORD === 'your_email_password') {
    console.warn('⚠️  Email password appears to be a placeholder. Please set a real app-specific password in .env');
    return false;
  }
  
  return true;
};

// Create transporter with better error handling
let transporter = null;

try {
  if (validateEmailConfig()) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      },
      tls: {
        // Do not fail on invalid certs
        rejectUnauthorized: false
      }
    });
    
    // Verify transporter configuration
    transporter.verify(function (error, success) {
      if (error) {
        console.error('\n❌ EMAIL CONFIGURATION ERROR ❌');
        console.error('═══════════════════════════════════════════════════════');
        console.error('Error:', error.message);
        console.error('\n💡 QUICK FIX:');
        console.error('   1. Go to: https://myaccount.google.com/apppasswords');
        console.error('   2. Generate an App Password (16 characters)');
        console.error('   3. Update EMAIL_PASSWORD in your .env file');
        console.error('   4. Restart your server');
        console.error('\n📋 Current Configuration:');
        console.error('   EMAIL_HOST:', process.env.EMAIL_HOST || 'NOT SET');
        console.error('   EMAIL_PORT:', process.env.EMAIL_PORT || 'NOT SET');
        console.error('   EMAIL_USER:', process.env.EMAIL_USER || 'NOT SET');
        console.error('   EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? 
          (process.env.EMAIL_PASSWORD.includes('your-app') ? '❌ PLACEHOLDER (NEEDS REAL PASSWORD)' : '✅ SET') : 
          '❌ NOT SET');
        console.error('═══════════════════════════════════════════════════════\n');
        
        if (error.code === 'EAUTH') {
          console.error('🔐 AUTHENTICATION ERROR:');
          console.error('   → Your EMAIL_PASSWORD is incorrect');
          console.error('   → Make sure you are using an App Password, not your regular Gmail password');
          console.error('   → Generate a new App Password: https://myaccount.google.com/apppasswords\n');
        }
      } else {
        console.log('\n✅ Email transporter is ready to send messages ✅\n');
      }
    });
  } else {
    console.warn('⚠️  Email transporter not initialized due to missing configuration');
  }
} catch (error) {
  console.error('❌ Failed to create email transporter:', error.message);
}

exports.sendOTPEmail = async (email, otp) => {
  try {
    // Check if transporter is configured
    if (!transporter) {
      const errorMsg = 'Email transporter not configured. Please check your .env file.';
      console.error('❌', errorMsg);
      return { success: false, error: errorMsg };
    }

    // Validate email address
    if (!email || !email.includes('@')) {
      const errorMsg = 'Invalid email address';
      console.error('❌', errorMsg);
      return { success: false, error: errorMsg };
    }

    const info = await transporter.sendMail({
      from: `"ONE-Go Security" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Email Verification - ONE-Go Security',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Email Verification</h2>
          <p>Your OTP code is:</p>
          <h1 style="color: #2563eb; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
          <p>This code will expire in 10 minutes.</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            If you didn't request this code, please ignore this email.
          </p>
        </div>
      `
    });

    console.log('✅ Email sent successfully to', email, '- Message ID:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email sending error:', error.message);
    console.error('Full error:', error);
    
    // Provide helpful error messages
    let errorMessage = error.message;
    if (error.code === 'EAUTH') {
      errorMessage = 'Email authentication failed. Please check your email credentials in .env file.';
      console.error('💡 For Gmail, make sure you are using an App Password, not your regular password.');
    } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
      errorMessage = 'Could not connect to email server. Please check EMAIL_HOST and EMAIL_PORT in .env.';
    } else if (error.code === 'EENVELOPE') {
      errorMessage = 'Invalid email address format.';
    }
    
    return { success: false, error: errorMessage };
  }
};