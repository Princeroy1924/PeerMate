import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Check,
  Sparkles,
  Crown,
  ShieldCheck,
  Copy,
  ExternalLink,
  Upload,
  Clock,
  AlertCircle,
  FileText,
  Eye,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Info,
  Calendar,
  Lock,
  ArrowRight,
  Smartphone,
  Radio,
  Zap,
  CheckCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { playSound } from '../../lib/audio';
import { PAYMENT_CONFIG, generateUpiIntentUrl, isValidUtr, maskUtr } from '../../config/paymentConfig';
import { UpiQrCode } from './UpiQrCode';
import { PeerMateLogo } from '../common/PeerMateLogo';
import { PaymentSession } from '../../types';

interface PricingModalProps {
  onClose: () => void;
}

export const PricingModal: React.FC<PricingModalProps> = ({ onClose }) => {
  const { user, refreshUser } = useAuth();

  // Navigation tab inside modal: 'pay' | 'history'
  const [activeTab, setActiveTab] = useState<'pay' | 'history'>('pay');

  // Intent Session Flow State
  const [activeSession, setActiveSession] = useState<PaymentSession | null>(null);
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [paymentApproved, setPaymentApproved] = useState(false);

  // Form State (for proof submission / manual attachment)
  const [showProofForm, setShowProofForm] = useState(false);
  const [utr, setUtr] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
  const [screenshotFileName, setScreenshotFileName] = useState('');
  const [screenshotFileSize, setScreenshotFileSize] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  // Status & State
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [copiedTr, setCopiedTr] = useState(false);
  const [submittingProof, setSubmittingProof] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [submittedPayment, setSubmittedPayment] = useState<any | null>(null);

  // History State
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<any>(null);

  // Pro Features list
  const proFeatures = [
    'Unlimited AI English speaking practice calls',
    'AI voice calls with real-time conversations',
    'Post-call AI grammar feedback & scoring',
    'Vocabulary feedback & native phrasing corrections',
    'Pronunciation feedback & speaking analytics',
    'New vocabulary extracted automatically after calls',
    'Fast-track league XP multiplier & streak booster',
  ];

  // Load past user payments on mount
  useEffect(() => {
    loadHistory();
  }, [user?.id]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const loadHistory = async () => {
    if (!user) return;
    setLoadingHistory(true);
    try {
      const res = await api.getPaymentHistory();
      if (res && res.payments) {
        setPaymentHistory(res.payments);
        const latest = res.payments[0];
        if (latest && latest.status === 'pending') {
          setSubmittedPayment(latest);
        }
      }
    } catch (err) {
      console.warn('Could not fetch payment history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  /**
   * Intent-based Payment Flow:
   * 1. Clicking 'Upgrade' generates a payment session record in the payments table
   * 2. Triggers deep-link URI (upi://pay) for mobile users
   * 3. Activates automatic polling to detect payment approval
   */
  const handleStartIntentPayment = async () => {
    if (!user) {
      setErrorMessage('Please sign in to upgrade to PeerMate Pro.');
      return;
    }

    setErrorMessage('');
    setIsCreatingIntent(true);
    playSound('click');

    try {
      const response = await api.createPaymentIntent({
        notes: 'PeerMate Pro Subscription',
      });

      if (response.success && response.paymentSession) {
        const session = response.paymentSession;
        setActiveSession(session);

        // Deep-link trigger for mobile users
        const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        );

        if (isMobile && session.intentUri) {
          window.location.href = session.intentUri;
        }

        // Start real-time polling mechanism
        startPolling(session.id);
      } else {
        throw new Error('Could not initiate payment session.');
      }
    } catch (err: any) {
      console.error('❌ Intent Payment Creation Error:', err);
      setErrorMessage(err.message || 'Failed to start payment session. Please try again.');
    } finally {
      setIsCreatingIntent(false);
    }
  };

  /**
   * Polling Mechanism:
   * Polls every 3.5 seconds to check if status is approved or user became Pro
   */
  const startPolling = (paymentId: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    setIsPolling(true);
    setPollCount(0);

    pollIntervalRef.current = setInterval(async () => {
      try {
        setPollCount((prev) => prev + 1);

        // Check payment session status
        const statusRes = await api.getPaymentSessionStatus(paymentId);

        if (statusRes.status === 'approved' || statusRes.isPro) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
          setIsPolling(false);
          setPaymentApproved(true);
          playSound('success');
          await refreshUser().catch(() => {});
          await loadHistory();
          return;
        }

        // Also check general subscription status
        const subRes = await api.getSubscriptionStatus();
        if (subRes.isPro) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
          setIsPolling(false);
          setPaymentApproved(true);
          playSound('success');
          await refreshUser().catch(() => {});
          await loadHistory();
        }
      } catch (e) {
        console.warn('[PAYMENT_POLL_WARN]', e);
      }
    }, 3500);
  };

  const manualCheckStatus = async () => {
    if (!activeSession) return;
    playSound('click');
    try {
      const res = await api.getPaymentSessionStatus(activeSession.id);
      if (res.status === 'approved' || res.isPro) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        setIsPolling(false);
        setPaymentApproved(true);
        playSound('success');
        await refreshUser().catch(() => {});
        await loadHistory();
      } else {
        setSuccessMessage('Payment status checked: Still waiting for confirmation.');
        setTimeout(() => setSuccessMessage(''), 3000);
      }
    } catch {
      // Ignored
    }
  };

  const handleOpenDirectUpi = () => {
    playSound('click');
    const intentUrl = activeSession?.intentUri || generateUpiIntentUrl(undefined, PAYMENT_CONFIG.UPI_ID);
    window.location.href = intentUrl;
  };

  const copyUpiId = async () => {
    try {
      await navigator.clipboard.writeText(PAYMENT_CONFIG.UPI_ID);
      setCopiedUpi(true);
      playSound('click');
      setTimeout(() => setCopiedUpi(false), 2500);
    } catch {
      // Fallback
    }
  };

  const copyTransactionRef = async () => {
    if (!activeSession?.transactionRef) return;
    try {
      await navigator.clipboard.writeText(activeSession.transactionRef);
      setCopiedTr(true);
      playSound('click');
      setTimeout(() => setCopiedTr(false), 2500);
    } catch {
      // Fallback
    }
  };

  // Handle Screenshot Upload & Strict Validation
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setErrorMessage('');

    if (!file) return;

    if (!PAYMENT_CONFIG.ALLOWED_SCREENSHOT_TYPES.includes(file.type)) {
      setErrorMessage('Invalid file format. Please upload a screenshot in JPG, JPEG, PNG, or WebP format.');
      return;
    }

    if (file.size > PAYMENT_CONFIG.MAX_SCREENSHOT_SIZE_BYTES) {
      setErrorMessage('File is too large. Maximum allowed screenshot size is 5MB.');
      return;
    }

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    setScreenshotFileName(sanitizedName);
    setScreenshotFileSize((file.size / (1024 * 1024)).toFixed(2) + ' MB');

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setScreenshotBase64(base64);
    };
    reader.onerror = () => {
      setErrorMessage('Failed to read the selected file. Please try selecting the image again.');
    };
    reader.readAsDataURL(file);
  };

  const handleAttachProof = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!user) {
      setErrorMessage('You must be signed in to submit payment proof.');
      return;
    }

    const utrValue = utr.trim() || (activeSession ? activeSession.transactionRef : '');
    const utrCheck = isValidUtr(utrValue);
    if (!utrCheck.isValid) {
      setErrorMessage(utrCheck.error || 'Please enter a valid UTR number.');
      return;
    }

    if (!paymentDate) {
      setErrorMessage('Please select the date of your UPI payment.');
      return;
    }

    if (!screenshotBase64) {
      setErrorMessage('Please upload a screenshot of your successful UPI payment receipt.');
      return;
    }

    playSound('click');
    setSubmittingProof(true);

    try {
      if (activeSession) {
        // Attach proof directly to the existing payment session
        const res = await api.attachPaymentProof({
          paymentId: activeSession.id,
          utr: utrValue.toUpperCase(),
          paymentDate,
          screenshotBase64,
        });

        if (res.success) {
          setSubmittedPayment(res.payment);
          setShowProofForm(false);
          playSound('success');
          setSuccessMessage('Receipt uploaded! Our team is verifying your payment.');
          setTimeout(() => setSuccessMessage(''), 4000);
          await loadHistory();
        }
      } else {
        // Fallback: Submit new manual payment record
        const response = await api.submitUpiPayment({
          utr: utrValue.toUpperCase(),
          paymentDate,
          screenshotBase64,
        });

        if (response.success) {
          setSubmittedPayment(response.payment);
          setShowProofForm(false);
          playSound('success');
          await loadHistory();
          await refreshUser().catch(() => {});
        } else {
          throw new Error(response.message || 'Payment submission failed.');
        }
      }
    } catch (err: any) {
      console.error('❌ Proof Submission Error:', err);
      setErrorMessage(err.message || 'Failed to submit payment proof.');
    } finally {
      setSubmittingProof(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl p-5 sm:p-7 max-w-2xl w-full my-auto space-y-5 shadow-2xl animate-in zoom-in-95 max-h-[92vh] overflow-y-auto border border-slate-100">
        {/* Top Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3.5">
            <PeerMateLogo size="sm" showText={false} />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-lg sm:text-xl text-slate-900 leading-tight">PeerMate Pro Plan</h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                  <Crown className="w-2.5 h-2.5 text-amber-600" />
                  ₹{PAYMENT_CONFIG.PRO_PRICE} / Month
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Intent-Based UPI Payment • Fast Instant Linking & Verification
              </p>
            </div>
          </div>

          <button
            id="close-pricing-btn"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('pay')}
            className={`flex-1 py-2 rounded-lg transition-all text-center cursor-pointer ${
              activeTab === 'pay' ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pay with UPI
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2 rounded-lg transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'history' ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>My Payment History</span>
            {paymentHistory.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-bold">
                {paymentHistory.length}
              </span>
            )}
          </button>
        </div>

        {/* Celebratory Approved Screen when Polling Detects Success */}
        {paymentApproved ? (
          <div className="py-8 px-6 text-center space-y-4 bg-emerald-50/80 rounded-3xl border border-emerald-200 animate-in zoom-in-95">
            <div className="w-16 h-16 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-200 animate-bounce">
              <Crown className="w-8 h-8 text-amber-300" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-black text-emerald-950">Payment Approved & Pro Activated!</h3>
              <p className="text-xs text-emerald-800 max-w-md mx-auto">
                Welcome to <strong>PeerMate Pro</strong>! Your unlimited AI practice calls, live grammar scoring, native feedback, and streak booster features are now unlocked.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="py-3 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-200 transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Start Learning as Pro Now</span>
            </button>
          </div>
        ) : (
          <>
            {/* Active Pro Banner if user already has Pro */}
            {user?.plan === 'pro' && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="text-xs">
                  <span className="font-extrabold text-emerald-900">Your PeerMate Pro Subscription is Active!</span>
                  <p className="text-emerald-700">You have full unlimited access to all AI English speaking features.</p>
                </div>
              </div>
            )}

            {/* TAB 1: PAY & SUBMIT */}
            {activeTab === 'pay' && (
              <div className="space-y-5">
                {/* Pro Benefits Highlights */}
                <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-xs text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      What You Get in PeerMate Pro (₹99 / Month)
                    </span>
                    <span className="text-[11px] font-black text-indigo-700">₹99 / 30 Days</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {proFeatures.map((feat, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Error Message */}
                {errorMessage && (
                  <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-rose-700">{errorMessage}</p>
                  </div>
                )}

                {/* Success Notice */}
                {successMessage && (
                  <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-start gap-2 animate-in fade-in">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-emerald-700">{successMessage}</p>
                  </div>
                )}

                {/* STATE 1: INTENT NOT STARTED YET (Primary Upgrade Action) */}
                {!activeSession ? (
                  <div className="space-y-4 text-center p-6 bg-slate-50/80 rounded-3xl border border-slate-200">
                    <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
                      <Zap className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-extrabold text-base text-slate-900">Upgrade to PeerMate Pro</h4>
                      <p className="text-xs text-slate-600 max-w-sm mx-auto">
                        Click <strong>Upgrade Now</strong> to generate a secure UPI payment session and open your preferred payment app (GPay, PhonePe, Paytm).
                      </p>
                    </div>

                    <div className="pt-2 max-w-xs mx-auto space-y-2">
                      <button
                        type="button"
                        id="upgrade-intent-btn"
                        onClick={handleStartIntentPayment}
                        disabled={isCreatingIntent}
                        className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 active:scale-98 text-white font-extrabold text-xs shadow-md shadow-indigo-200 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isCreatingIntent ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Creating Payment Session...</span>
                          </>
                        ) : (
                          <>
                            <Crown className="w-4 h-4 text-amber-300" />
                            <span>Upgrade Now for ₹{PAYMENT_CONFIG.PRO_PRICE}</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>

                      <div className="flex items-center justify-center gap-2 text-[10px] text-slate-400 font-medium">
                        <Smartphone className="w-3 h-3 text-slate-400" />
                        <span>Supports Google Pay, PhonePe, Paytm, BHIM, CRED</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* STATE 2: ACTIVE INTENT PAYMENT SESSION & LIVE POLLING */
                  <div className="space-y-4 animate-in fade-in">
                    {/* Live Session Status Badge */}
                    <div className="p-3.5 rounded-2xl bg-indigo-50/80 border border-indigo-200 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Radio className="w-4 h-4 text-indigo-600 animate-ping" />
                          <Radio className="w-4 h-4 text-indigo-600 absolute inset-0" />
                        </div>
                        <div className="text-left">
                          <span className="text-[11px] font-bold text-indigo-950 block">
                            Payment Session Active • Ref: <span className="font-mono font-bold">{activeSession.transactionRef}</span>
                          </span>
                          <span className="text-[10px] text-indigo-700 flex items-center gap-1">
                            <span>Auto-checking status</span>
                            {isPolling && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                            <span>({pollCount} checks)</span>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={manualCheckStatus}
                          className="py-1 px-2.5 rounded-lg bg-white border border-indigo-200 hover:border-indigo-400 text-indigo-900 text-[10px] font-bold shadow-xs cursor-pointer flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3 text-indigo-600" />
                          <span>Check Status</span>
                        </button>
                        <button
                          type="button"
                          onClick={copyTransactionRef}
                          className="py-1 px-2.5 rounded-lg bg-white border border-indigo-200 hover:border-indigo-400 text-indigo-900 text-[10px] font-bold shadow-xs cursor-pointer flex items-center gap-1"
                        >
                          {copiedTr ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-slate-500" />}
                          <span>{copiedTr ? 'Copied' : 'Copy Ref'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Main Active Session Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                      {/* Left: Dynamic QR code bound to active session & Deep links */}
                      <div className="md:col-span-5 flex flex-col items-center bg-slate-50 p-4 rounded-3xl border border-slate-200 space-y-3">
                        <span className="font-extrabold text-xs text-slate-800 uppercase tracking-wider">
                          Scan to Complete
                        </span>

                        <UpiQrCode
                          size={180}
                          customIntentUrl={activeSession.intentUri}
                          transactionRef={activeSession.transactionRef}
                        />

                        {/* Open UPI App Button */}
                        <div className="w-full space-y-2">
                          <button
                            type="button"
                            id="open-upi-intent-app-btn"
                            onClick={handleOpenDirectUpi}
                            className="w-full py-2.5 px-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white font-extrabold text-xs shadow-md shadow-indigo-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                          >
                            <span>Open UPI App (₹{PAYMENT_CONFIG.PRO_PRICE})</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>

                          <div className="grid grid-cols-3 gap-1 text-[10px] text-center font-bold">
                            <button
                              type="button"
                              onClick={handleOpenDirectUpi}
                              className="p-1.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 text-slate-700 flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-xs"
                            >
                              <span className="text-blue-600">G</span>Pay
                            </button>
                            <button
                              type="button"
                              onClick={handleOpenDirectUpi}
                              className="p-1.5 rounded-xl bg-white border border-slate-200 hover:border-purple-400 text-slate-700 flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-xs"
                            >
                              <span className="text-purple-600">Phone</span>Pe
                            </button>
                            <button
                              type="button"
                              onClick={handleOpenDirectUpi}
                              className="p-1.5 rounded-xl bg-white border border-slate-200 hover:border-cyan-400 text-slate-700 flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-xs"
                            >
                              <span className="text-cyan-600">Pay</span>tm
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Right: Step Status & Optional Proof Form */}
                      <div className="md:col-span-7 space-y-3">
                        {/* Live Waiting Card */}
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-left">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-amber-600 animate-spin" />
                            <h5 className="font-extrabold text-xs text-slate-900">Waiting for Payment Confirmation</h5>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            Complete the payment in your UPI app. As soon as the transaction is confirmed, your Pro subscription will unlock automatically without refreshing.
                          </p>
                        </div>

                        {/* Toggle Proof Upload Form */}
                        {!showProofForm ? (
                          <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-100 flex items-center justify-between gap-3">
                            <div className="text-left">
                              <span className="text-xs font-bold text-indigo-950 block">Paid already?</span>
                              <span className="text-[10px] text-slate-500">Attach your bank UTR or receipt for fast verification</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowProofForm(true)}
                              className="py-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs cursor-pointer shrink-0"
                            >
                              Attach Proof
                            </button>
                          </div>
                        ) : (
                          /* Proof Submission Form */
                          <form onSubmit={handleAttachProof} className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-left animate-in fade-in">
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-xs text-slate-900">Attach Payment Proof</span>
                              <button
                                type="button"
                                onClick={() => setShowProofForm(false)}
                                className="text-[10px] text-slate-500 hover:text-slate-800 font-bold cursor-pointer"
                              >
                                Hide form
                              </button>
                            </div>

                            {/* UTR */}
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Bank UTR / Reference <span className="text-rose-500">*</span>
                              </label>
                              <input
                                type="text"
                                required
                                placeholder="e.g. 423589123456"
                                value={utr}
                                onChange={(e) => setUtr(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                                maxLength={30}
                                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 focus:border-indigo-600 text-xs font-mono font-bold text-slate-900 placeholder:text-slate-400"
                              />
                            </div>

                            {/* Screenshot Upload */}
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Receipt Screenshot <span className="text-rose-500">*</span>
                              </label>

                              <input
                                type="file"
                                ref={fileInputRef}
                                accept="image/jpeg,image/png,image/webp,image/jpg"
                                onChange={handleFileChange}
                                className="hidden"
                              />

                              {!screenshotBase64 ? (
                                <button
                                  type="button"
                                  onClick={() => fileInputRef.current?.click()}
                                  className="w-full py-3 px-3 rounded-xl border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer text-center"
                                >
                                  <Upload className="w-4 h-4 text-slate-400" />
                                  <span className="text-xs font-bold text-slate-700">Upload Receipt Screenshot</span>
                                </button>
                              ) : (
                                <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
                                  <div className="flex items-center gap-2 truncate">
                                    <img
                                      src={screenshotBase64}
                                      alt="Preview"
                                      className="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0"
                                    />
                                    <span className="text-xs font-bold text-slate-800 truncate">{screenshotFileName}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setScreenshotBase64(null)}
                                    className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </div>

                            <button
                              type="submit"
                              disabled={submittingProof}
                              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-xs cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                              {submittingProof ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>Submitting Proof...</span>
                                </>
                              ) : (
                                <>
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  <span>Submit Proof for Verification</span>
                                </>
                              )}
                            </button>
                          </form>
                        )}

                        <div className="pt-2 flex items-center justify-between text-[11px]">
                          <button
                            type="button"
                            onClick={() => {
                              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
                              setActiveSession(null);
                              setIsPolling(false);
                            }}
                            className="text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
                          >
                            ← Start New Session
                          </button>
                          <span className="text-slate-400">₹{PAYMENT_CONFIG.PRO_PRICE} INR (30 Days)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: PAYMENT HISTORY */}
            {activeTab === 'history' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-sm text-slate-800">Your Payment Submissions</h4>
                  <button
                    type="button"
                    onClick={loadHistory}
                    disabled={loadingHistory}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                {loadingHistory ? (
                  <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Loading your submissions...</span>
                  </div>
                ) : paymentHistory.length === 0 ? (
                  <div className="py-12 text-center bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-2">
                    <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                    <h5 className="font-bold text-xs text-slate-700">No Payment Submissions Yet</h5>
                    <p className="text-[11px] text-slate-500">
                      When you pay ₹99 using UPI and start a session, it will appear here.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('pay')}
                      className="mt-2 py-2 px-4 rounded-xl bg-indigo-600 text-white font-bold text-xs shadow-xs cursor-pointer"
                    >
                      Pay ₹99 with UPI
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-80 overflow-y-auto">
                    {paymentHistory.map((p) => {
                      const isApproved = p.status === 'approved';
                      const isPending = p.status === 'pending';
                      const isRejected = p.status === 'rejected';

                      return (
                        <div
                          key={p.id}
                          className="p-3.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                        >
                          <div className="space-y-1 text-left">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-sm text-slate-900">₹{p.amount}</span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                  isApproved
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : isPending
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {isApproved ? 'Approved' : isPending ? 'Pending Verification' : 'Rejected'}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1 font-medium">
                              <span>
                                UTR / Ref: <strong className="font-mono text-slate-700">{maskUtr(p.utr)}</strong>
                              </span>
                              <span>•</span>
                              <span>Date: {p.paymentDate || new Date(p.createdAt).toLocaleDateString()}</span>
                            </div>
                            {p.adminNote && (
                              <div className="text-[11px] text-slate-600 bg-slate-100 p-1.5 rounded-lg mt-1">
                                <strong>Note:</strong> {p.adminNote}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {p.screenshotPath && (
                              <button
                                type="button"
                                onClick={() => {
                                  setScreenshotBase64(p.screenshotPath);
                                  setPreviewOpen(true);
                                }}
                                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                                title="Preview Screenshot"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Receipt</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Screenshot Enlarged Modal Preview */}
        {previewOpen && screenshotBase64 && (
          <div
            className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setPreviewOpen(false)}
          >
            <div
              className="bg-white rounded-3xl p-5 max-w-md w-full space-y-3 shadow-2xl animate-in zoom-in-95"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="font-bold text-xs text-slate-800">Payment Receipt Preview</span>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="max-h-[65vh] overflow-auto rounded-xl border border-slate-200 p-1 bg-slate-50 flex items-center justify-center">
                <img
                  src={screenshotBase64}
                  alt="Payment Receipt"
                  className="w-full h-auto object-contain rounded-lg"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
