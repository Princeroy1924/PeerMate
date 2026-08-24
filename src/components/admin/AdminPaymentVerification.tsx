import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  X,
  RefreshCw,
  Search,
  Filter,
  AlertCircle,
  ExternalLink,
  User,
  Copy,
  Check,
  FileText,
  Calendar,
  Lock,
} from 'lucide-react';
import { api } from '../../lib/api';
import { playSound } from '../../lib/audio';
import { PeerMateLogo } from '../common/PeerMateLogo';

interface AdminPaymentVerificationProps {
  onClose: () => void;
  onPaymentApproved?: () => void;
}

export const AdminPaymentVerification: React.FC<AdminPaymentVerificationProps> = ({
  onClose,
  onPaymentApproved,
}) => {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isForbidden, setIsForbidden] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected screenshot for full modal review
  const [inspectPayment, setInspectPayment] = useState<any | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    payment: any;
    action: 'approve' | 'reject';
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [copiedUtr, setCopiedUtr] = useState<string | null>(null);

  useEffect(() => {
    fetchPayments();
  }, [statusFilter]);

  const fetchPayments = async () => {
    setLoading(true);
    setError('');
    setIsForbidden(false);
    try {
      const res = await api.getAdminPayments(statusFilter);
      if (res && res.payments) {
        setPayments(res.payments);
      }
    } catch (err: any) {
      console.error('❌ Admin payments fetch error:', err);
      const errMsg = err.message || 'Failed to load payments for admin review.';
      if (errMsg.includes('Access denied') || errMsg.includes('authorized admin') || errMsg.includes('403')) {
        setIsForbidden(true);
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (paymentId: string, action: 'approve' | 'reject') => {
    if (!paymentId) return;

    playSound('click');
    setActionLoading(paymentId);
    setError('');

    try {
      const res = await api.adminVerifyPayment({
        paymentId,
        action,
        adminNote: adminNote.trim() || undefined,
      });

      if (res.success) {
        playSound('success');
        setAdminNote('');
        if (inspectPayment?.id === paymentId) {
          setInspectPayment(null);
        }
        await fetchPayments();
        if (action === 'approve' && onPaymentApproved) {
          onPaymentApproved();
        }
      } else {
        throw new Error(res.message || 'Action failed.');
      }
    } catch (err: any) {
      console.error(`❌ Error verifying payment ${paymentId}:`, err);
      setError(err.message || `Failed to ${action} payment.`);
    } finally {
      setActionLoading(null);
    }
  };

  const copyUtr = (utr: string) => {
    navigator.clipboard.writeText(utr);
    setCopiedUtr(utr);
    playSound('click');
    setTimeout(() => setCopiedUtr(null), 2000);
  };

  const filteredPayments = payments.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.utr?.toLowerCase().includes(q) ||
      p.userEmail?.toLowerCase().includes(q) ||
      p.userDisplayName?.toLowerCase().includes(q) ||
      p.userId?.toLowerCase().includes(q)
    );
  });

  const pendingCount = payments.filter((p) => p.status === 'pending').length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl p-5 sm:p-7 max-w-4xl w-full my-auto space-y-5 shadow-2xl animate-in zoom-in-95 max-h-[92vh] overflow-y-auto border border-slate-100">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <PeerMateLogo size="sm" showText={false} />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-lg sm:text-xl text-slate-900 leading-tight">
                  Admin Payment Verification
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-indigo-600" />
                  Authorized Admin
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Verify UTR numbers & receipts to activate ₹99/month Pro subscriptions
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold w-full sm:w-auto">
            {['pending', 'approved', 'rejected', 'all'].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-lg capitalize transition-all cursor-pointer ${
                  statusFilter === tab ? 'bg-white text-indigo-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab} {tab === 'pending' && pendingCount > 0 && `(${pendingCount})`}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search UTR, email, or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:border-indigo-600 focus:bg-white transition-colors"
              />
            </div>

            <button
              onClick={fetchPayments}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              title="Refresh payments"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && !isForbidden && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Forbidden Access Screen */}
        {isForbidden ? (
          <div className="py-16 text-center bg-slate-50 rounded-2xl border border-rose-200 p-8 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="font-extrabold text-sm text-slate-900">Admin Authorization Required</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                This verification console is restricted strictly to authorized platform administrators. Your current account does not have permission to verify or modify payment records.
              </p>
            </div>
            <button
              type="button"
              id="admin-forbidden-close-btn"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors"
            >
              Close Console
            </button>
          </div>
        ) : loading ? (
          <div className="py-16 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Loading submissions for review...</span>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="py-16 text-center bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-2">
            <FileText className="w-8 h-8 text-slate-300 mx-auto" />
            <h5 className="font-bold text-xs text-slate-700">No Submissions Found</h5>
            <p className="text-[11px] text-slate-500">
              There are no {statusFilter !== 'all' ? statusFilter : ''} payment submissions matching your filter.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[58vh] overflow-y-auto pr-1">
            {filteredPayments.map((p) => {
              const isPending = p.status === 'pending';
              const isApproved = p.status === 'approved';
              const isRejected = p.status === 'rejected';

              return (
                <div
                  key={p.id}
                  className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition-all space-y-3 shadow-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="font-bold text-xs text-slate-900">
                          {p.userDisplayName || p.userEmail || 'Learner'}
                        </span>
                        {p.userEmail && (
                          <span className="text-[10px] text-slate-400 block font-mono">{p.userEmail}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-slate-900">₹{p.amount}</span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          isApproved
                            ? 'bg-emerald-100 text-emerald-800'
                            : isPending
                            ? 'bg-amber-100 text-amber-800 animate-pulse'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                  </div>

                  {/* Transaction Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">UTR Reference</span>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="font-mono font-black text-slate-800 text-xs">{p.utr}</span>
                        <button
                          type="button"
                          onClick={() => copyUtr(p.utr)}
                          className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-0.5 cursor-pointer"
                        >
                          {copiedUtr === p.utr ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">Payment Date</span>
                      <span className="font-semibold text-slate-700 text-xs mt-0.5 block">
                        {p.paymentDate || 'N/A'}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 block font-bold uppercase">Submitted At</span>
                      <span className="font-semibold text-slate-700 text-xs mt-0.5 block">
                        {new Date(p.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Receipt & Action Row */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
                    <div className="flex items-center gap-2">
                      {p.screenshotPath ? (
                        <button
                          type="button"
                          onClick={() => {
                            setInspectPayment(p);
                            setAdminNote(p.adminNote || '');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Inspect Receipt Image</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">No receipt attached</span>
                      )}
                      {p.verifiedBy && (
                        <span className="text-[10px] text-slate-400">Verified by: {p.verifiedBy}</span>
                      )}
                    </div>

                    {/* Action Buttons for Pending */}
                    {isPending ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          id={`admin-reject-btn-${p.id}`}
                          onClick={() => {
                            setAdminNote('');
                            setConfirmAction({ payment: p, action: 'reject' });
                          }}
                          disabled={actionLoading === p.id}
                          className="flex-1 sm:flex-initial px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>

                        <button
                          type="button"
                          id={`admin-approve-btn-${p.id}`}
                          onClick={() => {
                            setAdminNote('');
                            setConfirmAction({ payment: p, action: 'approve' });
                          }}
                          disabled={actionLoading === p.id}
                          className="flex-1 sm:flex-initial px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          {actionLoading === p.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          <span>Approve & Activate Pro</span>
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 font-medium">
                        Status: <strong className="text-slate-800 capitalize">{p.status}</strong>
                        {p.adminNote && <span className="block text-[11px] text-slate-400">Note: {p.adminNote}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Detailed Receipt Inspection Modal */}
        {inspectPayment && (
          <div
            className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4"
            onClick={() => setInspectPayment(null)}
          >
            <div
              className="bg-white rounded-3xl p-5 sm:p-6 max-w-lg w-full space-y-4 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h4 className="font-extrabold text-sm text-slate-900">Payment Verification Detail</h4>
                  <p className="text-[11px] text-slate-500 font-mono">UTR: {inspectPayment.utr}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectPayment(null)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Receipt Image Display */}
              <div className="rounded-2xl border border-slate-200 bg-slate-900/5 p-2 flex items-center justify-center max-h-72 overflow-auto">
                <img
                  src={inspectPayment.screenshotPath}
                  alt="Payment Receipt"
                  className="max-h-64 w-auto object-contain rounded-xl shadow-xs"
                />
              </div>

              {/* Summary Details */}
              <div className="space-y-1.5 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount:</span>
                  <span className="font-black text-slate-900">₹{inspectPayment.amount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">User:</span>
                  <span className="font-bold text-slate-800">
                    {inspectPayment.userDisplayName || inspectPayment.userEmail}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Payment Date:</span>
                  <span className="font-medium text-slate-700">{inspectPayment.paymentDate}</span>
                </div>
              </div>

              {/* Optional Admin Note */}
              {inspectPayment.status === 'pending' && (
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Admin Note (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Verified with Bank statement"
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:bg-white"
                  />
                </div>
              )}

              {/* Action Buttons in Modal */}
              {inspectPayment.status === 'pending' ? (
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    id="admin-modal-reject-btn"
                    onClick={() => {
                      const p = inspectPayment;
                      setInspectPayment(null);
                      setConfirmAction({ payment: p, action: 'reject' });
                    }}
                    disabled={actionLoading === inspectPayment.id}
                    className="flex-1 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Reject Payment</span>
                  </button>
                  <button
                    type="button"
                    id="admin-modal-approve-btn"
                    onClick={() => {
                      const p = inspectPayment;
                      setInspectPayment(null);
                      setConfirmAction({ payment: p, action: 'approve' });
                    }}
                    disabled={actionLoading === inspectPayment.id}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-200 transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Approve & Activate Pro</span>
                  </button>
                </div>
              ) : (
                <div className="text-center py-2 text-xs font-bold text-slate-600">
                  Payment is already <span className="capitalize">{inspectPayment.status}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Confirmation Modal for Admin Approval & Rejection */}
        {confirmAction && (
          <div
            className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setConfirmAction(null)}
          >
            <div
              className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-in zoom-in-95 border border-slate-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                    confirmAction.action === 'approve'
                      ? 'bg-emerald-100 text-emerald-600'
                      : 'bg-rose-100 text-rose-600'
                  }`}
                >
                  {confirmAction.action === 'approve' ? (
                    <ShieldCheck className="w-6 h-6" />
                  ) : (
                    <AlertCircle className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <h4 className="font-extrabold text-base text-slate-900">
                    {confirmAction.action === 'approve' ? 'Confirm Payment Approval' : 'Confirm Payment Rejection'}
                  </h4>
                  <p className="text-xs text-slate-500 font-mono">UTR: {confirmAction.payment.utr}</p>
                </div>
              </div>

              {/* Action specific details */}
              {confirmAction.action === 'approve' ? (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5 text-amber-800">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Bank Verification Required</span>
                  </div>
                  <p className="leading-relaxed">
                    Have you verified that <strong>₹{confirmAction.payment.amount}</strong> was actually received in Prince's bank / UPI account (<span className="font-mono font-semibold">legendxprince0-1@oksbi</span>)?
                  </p>
                  <p className="text-[11px] text-amber-700">
                    Approving will immediately grant 30 days of PeerMate Pro to <strong>{confirmAction.payment.userDisplayName || confirmAction.payment.userEmail}</strong>.
                  </p>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5 text-rose-800">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Payment Rejection Notice</span>
                  </div>
                  <p className="leading-relaxed">
                    Are you sure you want to reject transaction reference <strong className="font-mono">{confirmAction.payment.utr}</strong> submitted by <strong>{confirmAction.payment.userDisplayName || confirmAction.payment.userEmail}</strong>?
                  </p>
                  <p className="text-[11px] text-rose-700">
                    This will mark the submission as rejected and keep Pro features locked.
                  </p>
                </div>
              )}

              {/* Admin Note Input */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  {confirmAction.action === 'approve' ? 'Verification Note (Optional)' : 'Rejection Reason (Optional)'}
                </label>
                <input
                  id="admin-confirm-note-input"
                  type="text"
                  placeholder={
                    confirmAction.action === 'approve'
                      ? 'e.g. Verified in SBI / Bank Statement'
                      : 'e.g. UTR not matching statement / invalid screenshot'
                  }
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:bg-white focus:border-indigo-600 transition-colors"
                />
              </div>

              {/* Confirmation Buttons */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  id="admin-confirm-cancel-btn"
                  onClick={() => setConfirmAction(null)}
                  disabled={!!actionLoading}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="admin-confirm-execute-btn"
                  onClick={async () => {
                    const { payment, action } = confirmAction;
                    setConfirmAction(null);
                    await handleVerify(payment.id, action);
                  }}
                  disabled={!!actionLoading}
                  className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer text-white ${
                    confirmAction.action === 'approve'
                      ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
                      : 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'
                  }`}
                >
                  {confirmAction.action === 'approve' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm & Activate Pro</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4" />
                      <span>Confirm Rejection</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
