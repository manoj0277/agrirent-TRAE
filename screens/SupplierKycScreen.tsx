import React, { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import Button from '../components/Button'
import { User, KycSubmission, KycDocument, RiskLevel } from '../types'
import { useNotification } from '../context/NotificationContext'

interface KycRec { id: number; userId: number; status: string; timestamp?: string }

const SupplierKycScreen: React.FC = () => {
  const { allUsers } = useAuth()
  const { addNotification } = useNotification()
  const [kyc, setKyc] = useState<KycSubmission[]>([])
  const suppliers = useMemo(() => allUsers.filter(u => u.role === 'Supplier'), [allUsers])

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('kycSubmissions').select('*')
      setKyc((data || []) as any)
    }
    load()
    const ch = supabase
      .channel('kyc-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kycSubmissions' }, payload => {
        setKyc(prev => {
          const rec = payload.new as any
          const idx = prev.findIndex(r => r.id === rec.id)
          const next = [...prev]
          if (idx >= 0) next[idx] = rec
          else next.unshift(rec)
          return next
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const rows = useMemo(() => suppliers.map(u => {
    const k = kyc.find(x => x.userId === u.id)
    return { user: u, kycStatus: k?.status || (u.status === 'approved' ? 'Approved' : 'Pending'), submittedAt: k?.submittedAt, docs: k?.docs || [], risk: k?.riskLevel || 'LOW' as RiskLevel }
  }), [suppliers, kyc])

  const approve = async (u: User) => { await supabase.from('users').update({ status: 'approved' }).eq('id', u.id) }
  const reject = async (u: User) => { await supabase.from('users').update({ status: 'rejected' }).eq('id', u.id) }
  const askReupload = async (u: User, docType: KycDocument['type']) => {
    const { data } = await supabase.from('kycSubmissions').select('*').eq('userId', u.id).limit(1)
    const rec = (data && data[0]) as KycSubmission | undefined
    if (!rec) return
    const docs = rec.docs.map(d => d.type === docType ? { ...d, status: 'ReuploadRequested' } : d)
    await supabase.from('kycSubmissions').update({ docs }).eq('id', rec.id)
    addNotification({ userId: u.id, message: `Please re-upload ${docType} for KYC.`, type: 'admin' })
  }
  const addNote = async (u: User, note: string) => {
    const { data } = await supabase.from('kycSubmissions').select('*').eq('userId', u.id).limit(1)
    const rec = (data && data[0]) as KycSubmission | undefined
    if (!rec) return
    const next = [...(rec.adminNotes || []), note]
    await supabase.from('kycSubmissions').update({ adminNotes: next }).eq('id', rec.id)
  }
  const triggerFraud = async (u: User, reason: string) => {
    addNotification({ userId: 0, message: `KYC flag: ${u.name} - ${reason}`, type: 'admin' })
  }

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white dark:bg-neutral-800 p-4 rounded-lg border border-neutral-200 dark:border-neutral-700">
        <h4 className="font-semibold mb-2">Supplier KYC Live Submissions</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="p-2">Supplier</th>
                <th className="p-2">Phone</th>
                <th className="p-2">Location</th>
                <th className="p-2">Submitted Docs</th>
                <th className="p-2">KYC Status</th>
                <th className="p-2">Risk</th>
                <th className="p-2">Submitted</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.user.id} className="border-t border-neutral-200 dark:border-neutral-700">
                  <td className="p-2">{r.user.name}</td>
                  <td className="p-2">{r.user.phone}</td>
                  <td className="p-2">{r.user.location || (r.submittedAt ? '-' : '-')}</td>
                  <td className="p-2">{r.docs.length > 0 ? r.docs.map(d => d.type).join(', ') : '-'}</td>
                  <td className="p-2">{r.kycStatus}</td>
                  <td className="p-2">{r.risk}</td>
                  <td className="p-2">{r.submittedAt ? new Date(r.submittedAt).toLocaleString() : '-'}</td>
                  <td className="p-2">
                    <div className="flex gap-2">
                      <Button onClick={() => approve(r.user)} variant="secondary">Approve</Button>
                      <Button onClick={() => reject(r.user)} variant="secondary">Reject</Button>
                      <Button onClick={() => askReupload(r.user, 'Aadhaar')} variant="secondary">Ask Re-upload</Button>
                      <Button onClick={() => addNote(r.user, 'Missing GST doc')} variant="secondary">Add Note</Button>
                      <Button onClick={() => triggerFraud(r.user, 'Mismatched KYC')} variant="secondary">Trigger Fraud Flag</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td className="p-2" colSpan={6}>No suppliers</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default SupplierKycScreen