

import React, { useMemo } from 'react';
import { AppView, Booking, UserRole, ItemCategory } from '../types';
import Header from '../components/Header';
import { useBooking } from '../context/BookingContext';
import { useItem } from '../context/ItemContext';
import { useAuth } from '../context/AuthContext';

const StatCard: React.FC<{ title: string, value: string | number, icon: React.ReactElement }> = ({ title, value, icon }) => (
    <div className="bg-white dark:bg-neutral-700 p-4 rounded-lg border border-neutral-200 dark:border-neutral-600 flex items-center space-x-4">
        <div className="bg-primary/10 p-3 rounded-full">{icon}</div>
        <div>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">{title}</p>
            <p className="text-2xl font-bold text-neutral-800 dark:text-neutral-100">{value}</p>
        </div>
    </div>
);

const AdminAnalyticsScreen: React.FC = () => {
    const { bookings } = useBooking();
    const { items } = useItem();
    const { allUsers } = useAuth();

    const analytics = useMemo(() => {
        const completedBookings = bookings.filter(b => b.status === 'Completed');
        const totalRevenue = completedBookings.reduce((acc, b) => acc + (b.finalPrice || 0), 0);
        
        const bookingCountsByCategory = completedBookings.reduce((acc, b) => {
            acc[b.itemCategory] = (acc[b.itemCategory] || 0) + 1;
            return acc;
        }, {} as Record<ItemCategory, number>);

        const mostBookedCategory = Object.entries(bookingCountsByCategory).sort((a, b) => b[1] - a[1])[0];

        const totalFarmers = allUsers.filter(u => u.role === UserRole.Farmer).length;
        const totalSuppliers = allUsers.filter(u => u.role === UserRole.Supplier).length;

        const shortage = (() => {
            const byCatLoc: Record<string, { searching: number; available: number }> = {};
            bookings.forEach(b => {
                const key = `${b.itemCategory}:${b.location}`;
                byCatLoc[key] = byCatLoc[key] || { searching: 0, available: 0 };
                if (b.status === 'Searching') byCatLoc[key].searching += 1;
            });
            items.forEach(i => {
                const key = `${i.category}:${i.location}`;
                byCatLoc[key] = byCatLoc[key] || { searching: 0, available: 0 };
                if (i.available && i.status === 'approved') byCatLoc[key].available += 1;
            });
            return Object.entries(byCatLoc)
                .map(([k,v]) => ({ key: k, gap: v.searching - v.available }))
                .filter(x => x.gap > 0)
                .sort((a,b)=>b.gap - a.gap)
                .slice(0,5);
        })();
        const highDemandWindows = (() => {
            const byHour: Record<string, number> = {};
            bookings.forEach(b => {
                const h = (b.startTime || '00:00').split(':')[0];
                byHour[h] = (byHour[h] || 0) + 1;
            });
            return Object.entries(byHour).sort((a,b)=>parseInt(a[0])-parseInt(b[0])).slice(0,6);
        })();
        const lowUtilItems = (() => {
            const counts: Record<number, number> = {};
            bookings.forEach(b => { if (b.itemId) counts[b.itemId] = (counts[b.itemId] || 0) + 1; });
            return items.filter(i => (counts[i.id] || 0) === 0).slice(0,10);
        })();
        const topDemandMachines = (() => {
            const counts: Record<number, number> = {};
            bookings.forEach(b => { if (b.itemId) counts[b.itemId] = (counts[b.itemId] || 0) + 1; });
            return items.map(i => ({ item: i, c: counts[i.id] || 0 })).sort((a,b)=>b.c-a.c).slice(0,10);
        })();
        const priceTrends = (() => {
            const byItem: Record<number, { sum: number; n: number }> = {};
            completedBookings.forEach(b => { if (b.itemId && b.finalPrice) { const rec = byItem[b.itemId] || { sum: 0, n: 0 }; rec.sum += b.finalPrice; rec.n += 1; byItem[b.itemId] = rec; } });
            return Object.entries(byItem).map(([id, r]) => ({ id: Number(id), avg: r.sum / r.n })).sort((a,b)=>b.avg-a.avg).slice(0,10);
        })();
        const supplyVsDemand = (() => {
            const byRegion: Record<string, { demand: number; supply: number }> = {};
            bookings.forEach(b => { const k = b.location || 'Unknown'; byRegion[k] = byRegion[k] || { demand: 0, supply: 0 }; byRegion[k].demand += 1; });
            items.forEach(i => { const k = i.location || 'Unknown'; byRegion[k] = byRegion[k] || { demand: 0, supply: 0 }; if (i.available && i.status === 'approved') byRegion[k].supply += 1; });
            return Object.entries(byRegion).map(([region, v]) => ({ region, demand: v.demand, supply: v.supply, gap: v.demand - v.supply })).sort((a,b)=>b.gap-a.gap).slice(0,10);
        })();
        const incomeByRegion = (() => {
            const byRegion: Record<string, number> = {};
            completedBookings.forEach(b => { const k = b.location || 'Unknown'; byRegion[k] = (byRegion[k] || 0) + (b.finalPrice || 0); });
            return Object.entries(byRegion).map(([region, total]) => ({ region, total })).sort((a,b)=>b.total-a.total).slice(0,10);
        })();
        const seasonalSignals = (() => {
            const byMonthCat: Record<string, number> = {};
            bookings.forEach(b => { const m = new Date(b.date || new Date().toISOString()).getMonth()+1; const key = `${m}:${b.itemCategory}`; byMonthCat[key] = (byMonthCat[key] || 0) + 1; });
            const harvest = [9,10,11].map(m => ({ month: m, tractors: byMonthCat[`${m}:${ItemCategory.Tractors}`] || 0, harvesters: byMonthCat[`${m}:${ItemCategory.Harvesters}`] || 0 }));
            const rainy = [6,7,8].map(m => ({ month: m, tractors: byMonthCat[`${m}:${ItemCategory.Tractors}`] || 0 }));
            return { harvest, rainy };
        })();
        return {
            totalRevenue,
            totalCompletedBookings: completedBookings.length,
            avgBookingValue: completedBookings.length > 0 ? totalRevenue / completedBookings.length : 0,
            mostBookedCategory: mostBookedCategory ? `${mostBookedCategory[0]} (${mostBookedCategory[1]} bookings)` : 'N/A',
            totalFarmers,
            totalSuppliers,
            totalItems: items.length,
            regionalDemand: (() => {
                const byLoc: Record<string, { bookings: number; items: number; categories: Record<ItemCategory, number> }> = {};
                bookings.forEach(b => {
                    const loc = b.location || 'Unknown';
                    byLoc[loc] = byLoc[loc] || { bookings: 0, items: 0, categories: {} as any };
                    byLoc[loc].bookings += 1;
                    byLoc[loc].categories[b.itemCategory] = (byLoc[loc].categories[b.itemCategory] || 0) + 1;
                });
                items.forEach(i => {
                    const loc = i.location || 'Unknown';
                    byLoc[loc] = byLoc[loc] || { bookings: 0, items: 0, categories: {} as any };
                    byLoc[loc].items += 1;
                });
                const scored = Object.entries(byLoc).map(([loc, v]) => ({ loc, score: v.items > 0 ? v.bookings / v.items : v.bookings, topCategory: Object.entries(v.categories).sort((a,b)=>b[1]-a[1])[0]?.[0] }));
                return scored.sort((a,b)=>b.score - a.score).slice(0,5);
            })(),
            shortage,
            highDemandWindows,
            lowUtilItems,
            topDemandMachines,
            priceTrends,
            supplyVsDemand,
            incomeByRegion,
            seasonalSignals
        };
    }, [bookings, items, allUsers]);

    return (
        <div className="dark:text-neutral-200 bg-neutral-50 dark:bg-neutral-900 min-h-screen">
            <div className="p-4 space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <StatCard 
                        title="Total Revenue" 
                        value={`₹${analytics.totalRevenue.toLocaleString()}`} 
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01" /></svg>}
                    />
                    <StatCard 
                        title="Avg. Booking Value" 
                        value={`₹${analytics.avgBookingValue.toFixed(2)}`}
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
                    />
                     <StatCard 
                        title="Total Farmers" 
                        value={analytics.totalFarmers}
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
                    />
                     <StatCard 
                        title="Total Suppliers" 
                        value={analytics.totalSuppliers}
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
                    />
                </div>

                <div className="bg-white dark:bg-neutral-700 p-4 rounded-lg border border-neutral-200 dark:border-neutral-600">
                    <h3 className="font-bold text-neutral-800 dark:text-neutral-100 mb-2">Key Metrics</h3>
                    <ul className="divide-y divide-neutral-100 dark:divide-neutral-600">
                        <li className="flex justify-between py-2"><span className="text-neutral-600 dark:text-neutral-300">Total Completed Bookings:</span> <span className="font-semibold">{analytics.totalCompletedBookings}</span></li>
                        <li className="flex justify-between py-2"><span className="text-neutral-600 dark:text-neutral-300">Total Listed Items:</span> <span className="font-semibold">{analytics.totalItems}</span></li>
                        <li className="flex justify-between py-2"><span className="text-neutral-600 dark:text-neutral-300">Most Booked Category:</span> <span className="font-semibold">{analytics.mostBookedCategory}</span></li>
                    </ul>
                </div>
                <div className="bg-white dark:bg-neutral-700 p-4 rounded-lg border border-neutral-200 dark:border-neutral-600">
                    <h3 className="font-bold text-neutral-800 dark:text-neutral-100 mb-2">Regional Demand Prediction</h3>
                    {analytics.regionalDemand.length > 0 ? (
                        <ul className="space-y-2">
                            {analytics.regionalDemand.map((r, i) => (
                                <li key={i} className="flex justify-between items-center p-2 bg-neutral-50 dark:bg-neutral-600 rounded-md text-sm">
                                    <span className="font-semibold text-neutral-800 dark:text-neutral-100">{r.loc}</span>
                                    <span className="text-neutral-700 dark:text-neutral-300">Demand score: {r.score.toFixed(2)}</span>
                                    <span className="text-primary">Focus: {r.topCategory || 'General'}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-neutral-600 dark:text-neutral-300 text-sm">No demand signals yet.</p>
                    )}
                </div>
                <div className="bg-white dark:bg-neutral-700 p-4 rounded-lg border border-neutral-200 dark:border-neutral-600">
                    <h3 className="font-bold text-neutral-800 dark:text-neutral-100 mb-2">Inventory Forecast</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <p className="font-semibold mb-2">Machines Shortage</p>
                            <ul className="space-y-1 text-sm">
                                {analytics.shortage.length > 0 ? analytics.shortage.map((s,i)=> (
                                    <li key={i} className="flex justify-between"><span>{s.key}</span><span className="text-red-600">{s.gap}</span></li>
                                )) : <li>No shortages</li>}
                            </ul>
                        </div>
                        <div>
                            <p className="font-semibold mb-2">High Demand Windows</p>
                            <ul className="space-y-1 text-sm">
                                {analytics.highDemandWindows.map(([h,c],i)=> (
                                    <li key={i} className="flex justify-between"><span>{String(h).padStart(2,'0')}:00</span><span className="text-primary">{c}</span></li>
                                ))}
                            </ul>
                        </div>
                        <div className="md:col-span-2">
                            <p className="font-semibold mb-2">Low Utilization Items</p>
                            <ul className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                                {analytics.lowUtilItems.map(i => (
                                    <li key={i.id} className="p-2 bg-neutral-50 dark:bg-neutral-600 rounded">{i.name}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-neutral-700 p-4 rounded-lg border border-neutral-200 dark:border-neutral-600">
                    <h3 className="font-bold text-neutral-800 dark:text-neutral-100 mb-2">Machine Demand Analytics</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <p className="font-semibold mb-2">Top 10 High Demand Machines</p>
                            <ul className="space-y-1 text-sm">
                                {analytics.topDemandMachines.map(({ item, c }) => (
                                    <li key={item.id} className="flex justify-between"><span>{item.name}</span><span className="text-primary">{c}</span></li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <p className="font-semibold mb-2">Price Trends (Avg)</p>
                            <ul className="space-y-1 text-sm">
                                {analytics.priceTrends.map(({ id, avg }) => {
                                    const it = items.find(i => i.id === id)
                                    return <li key={id} className="flex justify-between"><span>{it?.name || id}</span><span className="text-neutral-700 dark:text-neutral-300">₹{avg.toFixed(0)}</span></li>
                                })}
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-neutral-700 p-4 rounded-lg border border-neutral-200 dark:border-neutral-600">
                    <h3 className="font-bold text-neutral-800 dark:text-neutral-100 mb-2">Geographical Analytics</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <p className="font-semibold mb-2">Supply vs Demand</p>
                            <ul className="space-y-1 text-sm">
                                {analytics.supplyVsDemand.map(r => (
                                    <li key={r.region} className="flex justify-between"><span>{r.region}</span><span className="text-neutral-700 dark:text-neutral-300">D:{r.demand} S:{r.supply} Gap:{r.gap}</span></li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <p className="font-semibold mb-2">Region-based Income</p>
                            <ul className="space-y-1 text-sm">
                                {analytics.incomeByRegion.map(r => (
                                    <li key={r.region} className="flex justify-between"><span>{r.region}</span><span className="text-primary">₹{r.total.toLocaleString()}</span></li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-neutral-700 p-4 rounded-lg border border-neutral-200 dark:border-neutral-600">
                    <h3 className="font-bold text-neutral-800 dark:text-neutral-100 mb-2">Seasonal Analytics</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <p className="font-semibold mb-2">Harvest Season Peak (Sep–Nov)</p>
                            <ul className="space-y-1 text-sm">
                                {analytics.seasonalSignals.harvest.map(s => (
                                    <li key={`h-${s.month}`} className="flex justify-between"><span>Month {s.month}</span><span className="text-neutral-700 dark:text-neutral-300">Tractors:{s.tractors} Harvesters:{s.harvesters}</span></li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <p className="font-semibold mb-2">Rainy Season Tractor Demand (Jun–Aug)</p>
                            <ul className="space-y-1 text-sm">
                                {analytics.seasonalSignals.rainy.map(s => (
                                    <li key={`r-${s.month}`} className="flex justify-between"><span>Month {s.month}</span><span className="text-primary">Tractors:{s.tractors}</span></li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default AdminAnalyticsScreen;