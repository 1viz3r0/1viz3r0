import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Mail, Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface OTPVerificationProps {
  type: 'email' | 'mobile';
  value: string;
  onVerified: (otp: string) => Promise<void>;
  onResend: () => Promise<void>;
  onCancel: () => void;
}

export default function OTPVerification({ type, value, onVerified, onResend, onCancel }: OTPVerificationProps) {
  const [otp, setOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const { toast } = useToast();

  const handleVerify = async () => {
    if (otp.length !== 6) {
      toast({
        title: 'Invalid OTP',
        description: 'Please enter a 6-digit OTP',
        variant: 'destructive',
      });
      return;
    }

    setIsVerifying(true);
    try {
      await onVerified(otp);
      // Clear OTP after successful verification
      setOtp('');
    } catch (error) {
      // Error handling is done in parent component
      // Don't clear OTP on error so user can retry
      console.error('OTP verification error:', error);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow Enter key to submit
    if (e.key === 'Enter' && otp.length === 6 && !isVerifying) {
      handleVerify();
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    try {
      await onResend();
      // Clear OTP field when resending
      setOtp('');
      toast({
        title: 'OTP Resent',
        description: `A new OTP has been sent to your ${type}`,
      });
    } catch (error) {
      console.error('Resend OTP error:', error);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-6 w-6 text-primary" />
          <CardTitle>OTP Verification</CardTitle>
        </div>
        <CardDescription>
          {type === 'email' ? (
            <span className="inline-flex items-center gap-2">
              <Mail className="h-4 w-4" />
              <span>Enter the OTP sent to {value}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <Phone className="h-4 w-4" />
              <span>Enter the OTP sent to {value}</span>
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="otp">Enter 6-Digit OTP</Label>
          <Input
            id="otp"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            value={otp}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '').slice(0, 6);
              setOtp(value);
            }}
            onKeyPress={handleKeyPress}
            className="text-center text-2xl tracking-widest font-mono"
            autoFocus
            disabled={isVerifying}
            autoComplete="one-time-code"
          />
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            className="flex-1"
            onClick={handleVerify}
            disabled={isVerifying || otp.length !== 6}
          >
            {isVerifying ? 'Verifying...' : 'Verify'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleResend}
            disabled={isResending}
          >
            {isResending ? 'Sending...' : 'Resend'}
          </Button>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </CardContent>
    </Card>
  );
}
