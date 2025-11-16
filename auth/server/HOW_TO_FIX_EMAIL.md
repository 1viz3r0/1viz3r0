# 🔧 How to Fix Email OTP Not Working

## 🎯 The Problem

Your `.env` file currently has:
```env
EMAIL_PASSWORD=your-app-specific-password
```

This is a **placeholder text**, not a real password. You need to replace it with a real Gmail App Password.

---

## 📖 What is an App-Specific Password?

**App-Specific Password** = A special 16-character code that Google gives you to let apps access your Gmail securely.

**Why you need it:**
- Gmail won't accept your regular password for security
- It's safer than using your main password
- You can delete it anytime without changing your password

**Example:** `abcd efgh ijkl mnop` (16 characters with or without spaces)

---

## ✅ Step-by-Step Solution

### Step 1: Enable 2-Step Verification (If Not Done)

1. Go to: https://myaccount.google.com/security
2. Find **2-Step Verification**
3. Click it and enable it (Google will text you a code)

### Step 2: Generate App Password

1. **Open this link**: https://myaccount.google.com/apppasswords
   - (Sign in if needed)

2. **Select options:**
   - **App**: Choose `Mail`
   - **Device**: Choose `Other (Custom name)`
   - **Name**: Type `ONE-Go Security`

3. **Click "Generate"**

4. **Copy the 16-character password** that appears
   - It looks like: `abcd efgh ijkl mnop`
   - ⚠️ **Copy it immediately** - you can't see it again!

### Step 3: Update .env File

1. Open `server/.env` file
2. Find this line:
   ```env
   EMAIL_PASSWORD=your-app-specific-password
   ```

3. Replace it with your App Password:
   ```env
   EMAIL_PASSWORD=abcd efgh ijkl mnop
   ```
   (Use your actual 16-character password)

4. **Save the file**

### Step 4: Restart Server

1. Stop your server (Press `Ctrl+C`)
2. Start it again: `npm start` or `node server.js`
3. Look for: `✅ Email transporter is ready to send messages`

---

## 🎉 How to Verify It's Working

### Check Server Console

When you start the server, you should see:
```
✅ Email transporter is ready to send messages ✅
```

If you see an error, it will tell you exactly what's wrong.

### Test Registration

1. Try registering a new account
2. You should receive an OTP email
3. If email fails in development mode, check server console for the OTP

---

## ❌ Common Errors & Fixes

### Error: "Invalid login" or "EAUTH"
**Problem:** Wrong password  
**Fix:** Generate a new App Password and update `.env`

### Error: "2-Step Verification not enabled"
**Problem:** Need to enable 2-Step Verification first  
**Fix:** Go to Google Account → Security → Enable 2-Step Verification

### Error: "Cannot generate app password"
**Problem:** Account restrictions  
**Fix:** Try a different Google account or contact administrator

### Still shows placeholder error
**Problem:** `.env` file not updated or server not restarted  
**Fix:** 
1. Double-check `.env` file has real password (not "your-app-specific-password")
2. Make sure you saved the file
3. Restart the server

---

## 📝 Complete .env Example

Here's what your email section should look like:

```env
# Email Configuration (Gmail)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=abcd efgh ijkl mnop
```

**Important:**
- Replace `your-email@gmail.com` with YOUR email
- Replace `abcd efgh ijkl mnop` with YOUR App Password
- No quotes needed
- Spaces in password are optional

---

## 🆘 Still Need Help?

1. **Check server console** - It shows detailed error messages
2. **Verify App Password** - Make sure you copied all 16 characters
3. **Try new App Password** - Generate a fresh one
4. **Check .env location** - Make sure it's in `server/` folder
5. **Restart server** - Always restart after changing `.env`

---

## 📚 More Information

- **Detailed Guide**: See `GMAIL_APP_PASSWORD_GUIDE.md`
- **Quick Fix**: See `QUICK_EMAIL_FIX.md`
- **Google Help**: https://support.google.com/accounts/answer/185833

---

## ✅ Quick Checklist

Before asking for help, make sure:

- [ ] 2-Step Verification is enabled on Google Account
- [ ] App Password is generated (16 characters)
- [ ] `.env` file updated with real App Password
- [ ] `.env` file saved
- [ ] Server restarted after updating `.env`
- [ ] Server console shows "✅ Email transporter is ready"
- [ ] No placeholder text in EMAIL_PASSWORD

If all checked and still not working, check the server console for the specific error message!

