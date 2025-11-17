import React, { useState, useMemo, useEffect } from 'react';
import { AppView, SupportTicket, UserRole } from '../types';
import { useSupport } from '../context/SupportContext';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import Button from '../components/Button';
import { useNotification } from '../context/NotificationContext';

interface ManageSupportTicketsScreenProps {
    onBack: () => void;
}

const TicketCard: React.FC<{ ticket: SupportTicket, onResolve: (id: number) => void, onReply: (id: number, text: string) => void, allUsers: any[] }> = ({ ticket, onResolve, onReply, allUsers }) => {
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [replyText, setReplyText] = useState('');
    const { user } = useAuth();
    
    const getStatusClasses = (status: SupportTicket['status']) => {
        switch (status) {
            case 'open': return 'bg-yellow-100 text-yellow-800';
            case 'closed': return 'bg-green-100 text-green-800';
            case 'escalated': return 'bg-red-100 text-red-800';
            case 'pending': return 'bg-blue-100 text-blue-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };
    
    const handleReply = () => {
        if (replyText.trim()) {
            onReply(ticket.id, replyText);
            setReplyText('');
        }
    };
    
    const getAuthorName = (authorId: number) => {
        const author = allUsers.find(u => u.id === authorId);
        if (author?.role === UserRole.Admin) return "Support Team";
        return author?.name || "User";
    };

    return (
        <div className="bg-white dark:bg-neutral-800 p-4 rounded-lg border border-neutral-200 dark:border-neutral-700">
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="font-bold text-neutral-800 dark:text-neutral-100">{ticket.name}</h3>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">{ticket.email} - {ticket.timestamp}</p>
                    <div className="mt-1 text-xs text-neutral-600 dark:text-neutral-300 flex gap-2">
                        {ticket.category && <span>Category: {ticket.category}</span>}
                        {ticket.subcategory && <span>Sub: {ticket.subcategory}</span>}
                        {ticket.priority && <span>Priority: {ticket.priority}</span>}
                        {ticket.bookingId && <span>Booking: {ticket.bookingId}</span>}
                    </div>
                </div>
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${getStatusClasses(ticket.status)}`}>
                    {ticket.status}
                </span>
            </div>
            <p className="mt-2 text-neutral-700 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-700 p-3 rounded-md">{ticket.message}</p>
            {ticket.evidenceUrls && ticket.evidenceUrls.length > 0 && (
                <div className="mt-2 flex gap-2 flex-wrap">
                    {ticket.evidenceUrls.map((u, i) => (
                        <a key={i} href={u} target="_blank" rel="noreferrer" className="text-xs underline text-primary">Evidence {i+1}</a>
                    ))}
                </div>
            )}
            
            {isChatOpen && (
                <div className="mt-3 border-t dark:border-neutral-600 pt-3 space-y-3">
                    {ticket.replies && ticket.replies.length > 0 ? (
                        ticket.replies.map(reply => (
                            <div key={reply.id} className={`p-2 rounded-lg text-sm ${reply.authorId === user?.id ? 'bg-blue-50 dark:bg-blue-900/40' : 'bg-neutral-100 dark:bg-neutral-600'}`}>
                               <p className="font-semibold">{getAuthorName(reply.authorId)}:</p>
                               <p>{reply.text}</p>
                            </div>
                        ))
                    ) : <p className="text-sm text-center text-neutral-500">No replies yet.</p>}

                    {ticket.status === 'open' && (
                        <div className="flex space-x-2">
                            <input
                                value={replyText}
                                onChange={e => setReplyText(e.target.value)}
                                placeholder="Type your reply..."
                                className="flex-grow p-2 border border-neutral-300 dark:border-neutral-500 rounded-lg text-sm bg-white dark:bg-neutral-800 text-black dark:text-white"
                            />
                            <Button onClick={handleReply} className="w-auto px-4 py-1 text-sm">Send</Button>
                        </div>
                    )}
                </div>
            )}
            
            {ticket.status === 'open' && (
                <div className="text-right mt-3 border-t border-neutral-100 dark:border-neutral-600 pt-3 flex justify-end items-center space-x-2">
                    <button onClick={() => setIsChatOpen(!isChatOpen)} className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500" title="Chat with user">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                    </button>
                    <button onClick={() => onResolve(ticket.id)} className="text-sm bg-green-600 text-white font-semibold py-1 px-3 rounded-md hover:bg-green-700">Mark as Resolved</button>
                </div>
            )}
        </div>
    );
};

const ManageSupportTicketsScreen: React.FC<ManageSupportTicketsScreenProps> = ({ onBack }) => {
    const { tickets, resolveTicket, addReplyToTicket } = useSupport();
    const { user, allUsers } = useAuth();
    const { addNotification } = useNotification();
    const [filter, setFilter] = useState<'all' | SupportTicket['status']>('all');
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<'priority' | 'time'>('priority');

    const handleReply = (ticketId: number, text: string) => {
        if (user) {
            addReplyToTicket(ticketId, {
                authorId: user.id,
                text,
                timestamp: new Date().toLocaleTimeString()
            });
        }
    };

    useEffect(() => {
        const highPriority = tickets.filter(t => t.priority === 'High' && t.status === 'open');
        highPriority.forEach(t => {
            const created = new Date(t.timestamp).getTime();
            const now = Date.now();
            if (now - created > 2 * 60 * 60 * 1000) {
                addNotification({ userId: 0, message: `High priority ticket ${t.id} breached 2h SLA.`, type: 'admin' });
            }
        });
        const bySupplier: Record<number, number> = {};
        tickets.forEach(t => { if (t.againstUserId) bySupplier[t.againstUserId] = (bySupplier[t.againstUserId] || 0) + 1; });
        Object.entries(bySupplier).forEach(([uid, c]) => { if (c >= 3) addNotification({ userId: 0, message: `Supplier ${uid} flagged with ${c} tickets.`, type: 'admin' }); });
        const byFarmerFalse: Record<number, number> = {};
        tickets.filter(t => t.status === 'closed' && (t.adminNotes || []).some(n => n.toLowerCase().includes('false')))
            .forEach(t => { if (t.userId) byFarmerFalse[t.userId] = (byFarmerFalse[t.userId] || 0) + 1; });
        Object.entries(byFarmerFalse).forEach(([uid, c]) => { if (c >= 2) addNotification({ userId: 0, message: `Farmer ${uid} flagged for repeated false reporting.`, type: 'admin' }); });
    }, [tickets]);

    const filteredTickets = useMemo(() => {
        let arr = [...tickets];
        if (sortBy === 'priority') {
            const order = { High: 0, Med: 1, Low: 2 } as any;
            arr.sort((a,b) => (order[a.priority || 'Low'] - order[b.priority || 'Low']))
        } else {
            arr.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        }
        if (filter === 'all') return sorted;
        const subset = arr.filter(t => t.status === filter);
        const q = search.trim().toLowerCase();
        if (!q) return subset;
        return subset.filter(t => (
            (t.name || '').toLowerCase().includes(q) ||
            (t.email || '').toLowerCase().includes(q) ||
            (t.message || '').toLowerCase().includes(q) ||
            (t.category || '').toLowerCase().includes(q) ||
            (t.subcategory || '').toLowerCase().includes(q)
        ));
    }, [tickets, filter, search, sortBy]);

    return (
        <div className="bg-neutral-50 dark:bg-neutral-900 min-h-screen">
            <div className="p-4">
                <div className="flex space-x-2 mb-4">
                    {(['all', 'open', 'closed'] as const).map(status => (
                        <button
                            key={status}
                            onClick={() => setFilter(status)}
                            className={`px-4 py-2 text-sm font-semibold rounded-full capitalize ${filter === status ? 'bg-primary text-white' : 'bg-neutral-200 dark:bg-neutral-600 text-neutral-700 dark:text-neutral-200'}`}
                        >
                            {status}
                        </button>
                    ))}
                    <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="px-3 py-2 text-sm rounded-full bg-neutral-200 dark:bg-neutral-600 text-neutral-700 dark:text-neutral-200">
                        <option value="priority">Sort by Priority</option>
                        <option value="time">Sort by Time</option>
                    </select>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search" className="flex-grow px-3 py-2 text-sm rounded-full bg-neutral-200 dark:bg-neutral-600 text-neutral-700 dark:text-neutral-200" />
                </div>
                <div className="space-y-3">
                    {filteredTickets.map(ticket => (
                        <TicketCard
                            key={ticket.id}
                            ticket={ticket}
                            onResolve={resolveTicket}
                            onReply={handleReply}
                            allUsers={allUsers}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ManageSupportTicketsScreen;