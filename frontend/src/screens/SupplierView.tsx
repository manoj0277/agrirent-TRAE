

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import { useAuth } from '../context/AuthContext';
import { useItem } from '../context/ItemContext';
import { Item, ItemCategory, Booking, AppView, WorkPurpose, WORK_PURPOSES } from '../types';
import Header from '../components/Header';
import Button from '../components/Button';
import Input from '../components/Input';
import ConfirmationDialog from '../components/ConfirmationDialog';
import NotificationBell from '../components/NotificationBell';
import BottomNav, { NavItemConfig } from '../components/BottomNav';
import { SupplierRequestsScreen } from './SupplierRequestsScreen';
import { useChat } from '../context/ChatContext';
import { useToast } from '../context/ToastContext';
import SupplierBookingsScreen from './SupplierBookingsScreen';
import { useBooking } from '../context/BookingContext';
import { useReview } from '../context/ReviewContext';
import SupplierScheduleScreen from './SupplierScheduleScreen';
import { GoogleGenAI } from "@google/genai";
import { useLanguage } from '../context/LanguageContext';
import { TranslationKey } from '../translations';
import { FALLBACK_IMAGE, onImgErrorSetFallback } from '../utils/imageFallback';
import { supabase } from '../../lib/supabase';

const apiKey = typeof process !== 'undefined' && process.env && process.env.API_KEY
  ? process.env.API_KEY
  : undefined;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;


interface SupplierViewProps {
    navigate: (view: AppView) => void;
}

const HEAVY_MACHINERY_CATEGORIES = [ItemCategory.Tractors, ItemCategory.Harvesters, ItemCategory.JCB, ItemCategory.Borewell];
const EQUIPMENT_CATEGORIES = [ItemCategory.Drones, ItemCategory.Sprayers];

const AddItemScreen: React.FC<{ itemToEdit: Item | null, onBack: () => void }> = ({ itemToEdit, onBack }) => {
    const { user, updateUser } = useAuth();
    const { addItem, updateItem } = useItem();
    const { showToast } = useToast();
    const { bookings } = useBooking();
    const { items } = useItem();
    const { t } = useLanguage();

    const [name, setName] = useState('');
    const [purposes, setPurposes] = useState<{ name: WorkPurpose, price: string }[]>([{ name: WORK_PURPOSES[0], price: '' }]);
    const [category, setCategory] = useState<ItemCategory>(itemToEdit?.category || ItemCategory.Tractors);
    const [location, setLocation] = useState('');
    const [description, setDescription] = useState('');
    const [operatorCharge, setOperatorCharge] = useState('');
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);
    const [quantityAvailable, setQuantityAvailable] = useState('');
    const [gender, setGender] = useState<'Male' | 'Female'>('Male');
    const [model, setModel] = useState('');
    const [licensePlate, setLicensePlate] = useState('');
    const [year, setYear] = useState('');
    const [horsepower, setHorsepower] = useState('');
    const [condition, setCondition] = useState<'New' | 'Good' | 'Fair'>('Good');
    const [priceSuggestion, setPriceSuggestion] = useState('');
    const [isSuggestingPrice, setIsSuggestingPrice] = useState(false);

    const isWorker = useMemo(() => category === ItemCategory.Workers, [category]);
    const isHeavyMachinery = useMemo(() => HEAVY_MACHINERY_CATEGORIES.includes(category), [category]);
    const isEquipment = useMemo(() => EQUIPMENT_CATEGORIES.includes(category), [category]);

    useEffect(() => {
        const resetForm = () => {
            setName('');
            setPurposes([{ name: WORK_PURPOSES[0], price: '' }]);
            setCategory(ItemCategory.Tractors);
            setLocation('');
            setDescription('');
            setOperatorCharge('');
            setImagePreview(null);
            setQuantityAvailable('');
            setGender('Male');
            setModel('');
            setLicensePlate('');
            setYear('');
            setHorsepower('');
            setCondition('Good');
        };

        if (itemToEdit) {
            setName(itemToEdit.name);
            setPurposes(itemToEdit.purposes.map(p => ({ name: p.name, price: p.price.toString() })));
            setCategory(itemToEdit.category);
            setLocation(itemToEdit.location);
            setDescription(itemToEdit.description);
            setOperatorCharge(itemToEdit.operatorCharge?.toString() || '');
            if (itemToEdit.images && itemToEdit.images.length > 0) setImagePreview(itemToEdit.images[0]);
            setQuantityAvailable(itemToEdit.quantityAvailable?.toString() || '');
            setGender(itemToEdit.gender || 'Male');
            setModel(itemToEdit.model || '');
            setLicensePlate(itemToEdit.licensePlate || '');
            setYear(itemToEdit.year?.toString() || '');
            setHorsepower(itemToEdit.horsepower?.toString() || '');
            setCondition(itemToEdit.condition || 'Good');
        } else {
            resetForm();
        }
    }, [itemToEdit]);
    
    const handleSuggestPrice = async (purposeName: WorkPurpose) => {
        if (!ai) {
            showToast("AI service is not configured.", "error");
            return;
        }
        setIsSuggestingPrice(true);
        setPriceSuggestion('');

        try {
            const relevantBookings = bookings.filter(b => 
                b.itemCategory === category && 
                b.status === 'Completed' && 
                b.workPurpose === purposeName &&
                b.finalPrice
            );
            
            const itemPrices = items.filter(i => 
                i.category === category
            ).flatMap(i => i.purposes.filter(p => p.name === purposeName)).map(p => p.price);

            if (relevantBookings.length < 2 && itemPrices.length < 2) {
                setPriceSuggestion('Not enough market data for a reliable suggestion.');
                return;
            }

            const prompt = `
                As a market analysis expert for an agricultural equipment rental platform called AgriRent, suggest a competitive hourly price for a supplier.
                - Item Category: ${category}
                - Work Purpose: ${purposeName}
                - Supplier's Location: ${location || 'not specified'}
                - Recent booking prices for similar items (price per hour): ${itemPrices.join(', ')}
                
                Based on this data, provide a suggested price range and a very brief justification.
                Respond with ONLY the suggested range and justification. For example: 'Suggested range: ₹1500 - ₹1800. This is competitive for your area.'
                If there is not enough data, just say 'Not enough data for a suggestion.'
            `;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });
            setPriceSuggestion(response.text);

        } catch (error) {
            console.error("Error getting price suggestion:", error);
            setPriceSuggestion("Could not get a suggestion at this time.");
        } finally {
            setIsSuggestingPrice(false);
        }
    };


    const handlePurposeChange = (index: number, field: 'name' | 'price', value: string) => {
        const newPurposes = [...purposes];
        newPurposes[index] = { ...newPurposes[index], [field]: value };
        setPurposes(newPurposes);
    };
    
    const addPurpose = () => {
        const usedPurposes = new Set(purposes.map(p => p.name));
        const nextPurpose = WORK_PURPOSES.find(p => !usedPurposes.has(p));
        if (nextPurpose) {
            setPurposes([...purposes, { name: nextPurpose, price: '' }]);
        } else {
            showToast("All available work purposes have been added.", "info");
        }
    };

    const removePurpose = (index: number) => {
        if (purposes.length > 1) {
            setPurposes(purposes.filter((_, i) => i !== index));
        }
    };
    
    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files ? Array.from(e.target.files) : [];
        if (files.length === 0) return;
        if (files.length > 3) {
            showToast('Please upload up to three images.', 'error');
        }
        const limited = files.slice(0, 3);
        const readers = limited.map(file => new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
        }));
        Promise.all(readers).then(urls => {
            setImagePreviews(urls);
            setImagePreview(urls[0] || null);
        });
    };

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        
        if (imagePreviews.length === 0 && category !== ItemCategory.Workers) {
            showToast('Please upload an image for the item.', 'error');
            return;
        }

        const validPurposes = purposes.filter(p => p.price && parseFloat(p.price) > 0);
        if (validPurposes.length === 0) {
            showToast('Please add at least one work purpose with a valid price.', 'error');
            return;
        }
        
        const defaultImages = {
            Male: FALLBACK_IMAGE,
            Female: FALLBACK_IMAGE,
        };
        const itemImages = category === ItemCategory.Workers 
            ? [defaultImages[gender]] 
            : (imagePreviews.length > 0 ? imagePreviews : [FALLBACK_IMAGE]);

        const itemData: Omit<Item, 'id'> = {
            name,
            category,
            purposes: validPurposes.map(p => ({ name: p.name, price: parseFloat(p.price) })),
            images: itemImages,
            ownerId: user.id,
            location,
            description,
            available: itemToEdit ? itemToEdit.available : true,
            status: 'pending' as const,
            operatorCharge: operatorCharge ? parseFloat(operatorCharge) : undefined,
            quantityAvailable: isWorker && quantityAvailable ? parseInt(quantityAvailable) : undefined,
            model: isHeavyMachinery || isEquipment ? model : undefined,
            licensePlate: isHeavyMachinery ? licensePlate : undefined,
            year: isHeavyMachinery && year ? parseInt(year) : undefined,
            horsepower: isHeavyMachinery && horsepower ? parseInt(horsepower) : undefined,
            condition: isHeavyMachinery || isEquipment ? condition : undefined,
            gender: isWorker ? gender : undefined,
        };
        
        if (itemToEdit) {
            updateItem({ ...itemToEdit, ...itemData });
        } else {
            addItem(itemData as Omit<Item, 'id'>);
        }
        onBack();
    };
    
    return (
        <div className="dark:text-neutral-200">
            <Header title={itemToEdit ? t('editItem') : t('addItem')} onBack={onBack} />
            <form className="p-4 space-y-4" onSubmit={handleSave}>
                 {category !== ItemCategory.Workers && (
                    <div>
                        <label className="block text-neutral-700 dark:text-neutral-300 text-sm font-bold mb-2">{t('itemImage')} <span className="text-red-600">*</span></label>
                        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-md">
                            <div className="space-y-1 text-center">
                                {imagePreviews.length > 0 ? (
                                    <div className="flex flex-wrap justify-center gap-2">
                                        {imagePreviews.map((img, i) => (
                                            <img key={i} src={img || FALLBACK_IMAGE} alt={`Preview ${i+1}`} className="h-20 w-28 object-cover rounded-md" referrerPolicy="no-referrer" crossOrigin="anonymous" onError={onImgErrorSetFallback} />
                                        ))}
                                    </div>
                                ) : (
                                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                )}
                                <div className="flex text-sm text-gray-400 justify-center">
                                    <label htmlFor="file-upload" className="relative cursor-pointer bg-white dark:bg-gray-700 rounded-md font-medium text-primary hover:text-primary-dark focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary px-2 py-1">
                                        <span>{imagePreviews.length > 0 ? 'Change images' : 'Upload images (1–3)'}</span>
                                        <input id="file-upload" name="file-upload" type="file" multiple className="sr-only" onChange={handleImageChange} accept=".jpeg,.jpg,.png,.webp" />
                                    </label>
                                </div>
                                <p className="text-xs text-gray-500">JPEG, JPG, PNG, WEBP (max 3)</p>
                            </div>
                        </div>
                    </div>
                 )}
                <Input label="Model Name" value={name} onChange={e => setName(e.target.value)} required/>
                <Input label={t('location')} value={location} onChange={e => setLocation(e.target.value)} required />
                 <div>
                    <label className="block text-neutral-700 dark:text-neutral-300 text-sm font-bold mb-2">{t('category')}</label>
                    <select value={category} onChange={e => setCategory(e.target.value as ItemCategory)} className="shadow appearance-none border border-neutral-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg w-full py-3 px-4 text-neutral-800 dark:text-white leading-tight focus:outline-none focus:ring-2 focus:ring-primary/50">
                        {Object.values(ItemCategory).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                {/* Work Purposes Section */}
                 <div className="space-y-3 p-3 border border-neutral-200 dark:border-neutral-600 rounded-lg">
                    <h3 className="font-bold text-neutral-800 dark:text-neutral-100">{t('workPurposesAndPricing')}</h3>
                    {priceSuggestion && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-sm rounded-md flex justify-between items-center">
                            <span>💡 {priceSuggestion}</span>
                            <button onClick={() => setPriceSuggestion('')} type="button" className="text-blue-500 hover:text-blue-700">&times;</button>
                        </div>
                    )}
                    {purposes.map((p, index) => (
                        <div key={index} className="p-2 bg-neutral-50 dark:bg-neutral-900/50 rounded-md">
                            <div className="flex items-center space-x-2">
                                <select
                                    value={p.name}
                                    onChange={(e) => handlePurposeChange(index, 'name', e.target.value)}
                                    className="flex-grow shadow-sm appearance-none border border-neutral-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg py-2 px-3 text-neutral-800 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                >
                                    {WORK_PURPOSES.map(wp => (
                                        <option key={wp} value={wp} disabled={purposes.some((purpose, i) => i !== index && purpose.name === wp)}>
                                            {wp}
                                        </option>
                                    ))}
                                </select>
                                <input
                                    type="number"
                                    placeholder="Price/hr (₹)"
                                    value={p.price}
                                    onChange={(e) => handlePurposeChange(index, 'price', e.target.value)}
                                    className="w-28 shadow-sm appearance-none border border-neutral-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg py-2 px-3 text-neutral-800 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                    required
                                />
                                <button type="button" onClick={() => removePurpose(index)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full disabled:opacity-50" disabled={purposes.length <= 1}>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                             <div className="text-right mt-2">
                                <button type="button" onClick={() => handleSuggestPrice(p.name)} disabled={isSuggestingPrice} className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 disabled:opacity-50">
                                    {isSuggestingPrice ? t('analyzing') : t('aiSuggestPrice')}
                                </button>
                            </div>
                        </div>
                    ))}
                    <Button type="button" variant="secondary" onClick={addPurpose} className="w-full text-sm py-2" disabled={purposes.length >= WORK_PURPOSES.length}>
                        {t('addAnotherPurpose')}
                    </Button>
                </div>

                {isWorker && (
                    <div>
                        <label className="block text-neutral-700 dark:text-neutral-300 text-sm font-bold mb-2">{t('gender')}</label>
                        <select value={gender} onChange={e => setGender(e.target.value as 'Male' | 'Female')} className="shadow appearance-none border border-neutral-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg w-full py-3 px-4 text-neutral-800 dark:text-white leading-tight focus:outline-none focus:ring-2 focus:ring-primary/50">
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                        </select>
                        <p className="text-xs text-neutral-500 mt-1">A default image will be assigned based on gender.</p>
                    </div>
                )}
                <div>
                     <label className="block text-neutral-700 dark:text-neutral-300 text-sm font-bold mb-2">{t('description')}</label>
                     <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} required className="shadow appearance-none border border-neutral-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg w-full py-3 px-4 text-neutral-800 dark:text-white placeholder-gray-400 leading-tight focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </div>
                {isHeavyMachinery && (
                    <>
                        <Input label="Machine Model" value={model} onChange={e => setModel(e.target.value)} required />
                        <Input label="Number Plate" value={licensePlate} onChange={e => setLicensePlate(e.target.value)} required />
                        <Input label="Year of Manufacture" type="number" value={year} onChange={e => setYear(e.target.value)} required />
                        <Input label="Horsepower (HP)" type="number" value={horsepower} onChange={e => setHorsepower(e.target.value)} required />
                    </>
                )}
                {isEquipment && (
                    <Input label="Equipment Model" value={model} onChange={e => setModel(e.target.value)} required />
                )}
                {(isHeavyMachinery || isEquipment) && (
                    <div>
                        <label className="block text-neutral-700 dark:text-neutral-300 text-sm font-bold mb-2">Condition</label>
                        <select value={condition} onChange={e => setCondition(e.target.value as 'New' | 'Good' | 'Fair')} className="shadow appearance-none border border-neutral-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg w-full py-3 px-4 text-neutral-800 dark:text-white leading-tight focus:outline-none focus:ring-2 focus:ring-primary/50">
                            <option value="New">New</option>
                            <option value="Good">Good</option>
                            <option value="Fair">Fair</option>
                        </select>
                    </div>
                )}
                <Input 
                    label={`Operator Charge per hour (₹) ${isHeavyMachinery ? '' : '(Optional)'}`} 
                    type="number" 
                    value={operatorCharge} 
                    onChange={e => setOperatorCharge(e.target.value)} 
                    required={isHeavyMachinery} 
                />
                {isWorker && (
                     <Input label="Available Quantity" type="number" value={quantityAvailable} onChange={e => setQuantityAvailable(e.target.value)} placeholder="e.g., 10" required min="0" />
                )}
                <Button type="submit">{itemToEdit ? t('saveChanges') : t('submitForApproval')}</Button>
            </form>
        </div>
    );
};

const SupplierListingsScreen: React.FC<{ onAddItem: () => void, onEditItem: (m: Item) => void }> = ({ onAddItem, onEditItem }) => {
    const { user } = useAuth();
    const { items, deleteItem } = useItem();
    const { t } = useLanguage();
    const myItems = items.filter(m => m.ownerId === user?.id);
    const [itemToDelete, setItemToDelete] = useState<Item | null>(null);

    const handleConfirmDelete = () => {
        if (itemToDelete) {
            deleteItem(itemToDelete.id);
        }
        setItemToDelete(null);
    }

    const handleAddItemClick = () => {
        onAddItem();
    };
    
    const getStatusClasses = (status: Item['status']) => {
        switch (status) {
            case 'approved': return 'bg-green-100 text-green-800';
            case 'pending': return 'bg-yellow-100 text-yellow-800';
            case 'rejected': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="dark:text-neutral-200">
            <div className="p-4">
                 <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100">{t('myItemsAndServices')}</h2>
                    <button onClick={handleAddItemClick} className="bg-primary text-white font-bold py-2 px-4 rounded-lg hover:bg-primary-dark transition-colors">+ {t('addItem')}</button>
                </div>

                <div className="space-y-3">
                    {myItems.length > 0 ? (
                        [...myItems].reverse().map(item => {
                            const minPrice = Math.min(...item.purposes.map(p => p.price));
                             return (
                            <div key={item.id} className="bg-white dark:bg-neutral-700 p-4 rounded-lg border border-neutral-200 dark:border-neutral-600">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="font-bold text-neutral-800 dark:text-neutral-100">{item.name}</h3>
                                        <p className="text-sm text-neutral-700 dark:text-neutral-300">Starting from ₹{minPrice}/hr</p>
                                    </div>
                                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${getStatusClasses(item.status)}`}>
                                        {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                                    </span>
                                </div>
                                {item.status === 'pending' && (
                                    <p className="mt-3 text-xs text-yellow-700 bg-yellow-100 rounded-md p-2">
                                        Your item is pending; admin is verifying your details.
                                    </p>
                                )}
                                 <div className="text-right mt-4 border-t border-neutral-100 dark:border-neutral-600 pt-3 flex justify-end space-x-2">
                                    <button onClick={() => onEditItem(item)} className="bg-primary text-white font-bold py-1 px-3 rounded-lg text-sm hover:bg-primary-dark transition-colors">{t('edit')}</button>
                                    <button onClick={() => setItemToDelete(item)} className="bg-red-600 text-white font-bold py-1 px-3 rounded-lg text-sm hover:bg-red-700 transition-colors">{t('delete')}</button>
                                </div>
                            </div>
                             )
                        })
                    ) : (
                        <p className="text-center text-neutral-700 dark:text-neutral-300 py-8">You haven't added any items yet.</p>
                    )}
                </div>
            </div>
            {itemToDelete && (
                 <ConfirmationDialog
                    title={t('delete') + ' Item'}
                    message={`Are you sure you want to delete "${itemToDelete.name}"?`}
                    confirmText={t('delete')}
                    cancelText={t('cancel')}
                    onConfirm={handleConfirmDelete}
                    onCancel={() => setItemToDelete(null)}
                />
            )}
        </div>
    )
}

const SupplierKycForm: React.FC<{ onSubmitted: () => void }> = ({ onSubmitted }) => {
    const { user, updateUser } = useAuth();
    const { t } = useLanguage();
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [location, setLocation] = useState('');
    const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [currentLoc, setCurrentLoc] = useState<{ lat: number; lng: number } | null>(null);
    const [email, setEmail] = useState('');
    const [idNumber, setIdNumber] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (user) {
            setFullName(user.name || '');
            setPhone(user.phone || '');
            setLocation(user.location || '');
            setEmail(user.email || '');
            if (user.locationCoords) setCoords(user.locationCoords);
        }
    }, [user]);

    useEffect(() => {
        if (!('geolocation' in navigator)) return;
        navigator.geolocation.getCurrentPosition(pos => {
            const { latitude, longitude } = pos.coords;
            setCurrentLoc({ lat: latitude, lng: longitude });
        });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setIsSubmitting(true);
        try {
            const updatedUser = {
                ...user,
                email,
                location,
                locationCoords: coords || user.locationCoords,
            };
            await updateUser(updatedUser);
            await supabase.from('kycSubmissions').upsert([{ userId: user.id, status: 'Submitted', timestamp: new Date().toISOString() }], { onConflict: 'userId' });
            onSubmitted();
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="p-4">
            <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100 mb-4">Supplier KYC</h2>
            <form className="space-y-4" onSubmit={handleSubmit}>
                <Input label="Full Name" value={fullName} onChange={e => setFullName(e.target.value)} required />
                <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                <Input label="Phone" value={phone} onChange={e => setPhone(e.target.value)} required />
                <Input label="Location" value={location} onChange={e => setLocation(e.target.value)} required />
                <div className="w-full h-64 rounded-md overflow-hidden">
                    <MapContainer
                        center={coords ? [coords.lat, coords.lng] : [17.385, 78.4867]}
                        zoom={12}
                        scrollWheelZoom={false}
                        style={{ height: '100%', width: '100%', touchAction: 'none' }}
                        whenCreated={(map) => {
                            map.dragging.disable();
                            const handleTouch = (e: any) => {
                                const touches = (e.originalEvent?.touches ?? e.touches) || [];
                                if (touches.length >= 2) {
                                    map.dragging.enable();
                                } else {
                                    map.dragging.disable();
                                }
                            };
                            map.on('touchstart', handleTouch);
                            map.on('touchmove', handleTouch);
                            map.on('touchend', () => map.dragging.disable());

                            map.on('click', (e: any) => {
                                const { lat, lng } = e.latlng;
                                setCoords({ lat, lng });
                                setLocation(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
                            });
                        }}
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        {currentLoc && (
                            <Marker
                                position={[currentLoc.lat, currentLoc.lng]}
                                icon={new L.DivIcon({
                                    html: '<div class="w-4 h-4 rounded-full bg-green-600 ring-2 ring-white"></div>',
                                    className: '',
                                    iconSize: [16, 16],
                                    iconAnchor: [8, 8],
                                })}
                            />
                        )}
                        {coords && (
                            <Marker
                                position={[coords.lat, coords.lng]}
                                icon={new L.DivIcon({
                                    html: '<div class="w-6 h-6 rounded-full bg-red-600 ring-2 ring-white"></div>',
                                    className: '',
                                    iconSize: [24, 24],
                                    iconAnchor: [12, 12],
                                })}
                            />
                        )}
                    </MapContainer>
                    <p className="text-xs text-neutral-600 mt-1">Tap to select location. Use two fingers to pan.</p>
                </div>
                <Input label="Government ID Number" value={idNumber} onChange={e => setIdNumber(e.target.value)} required />
                <Button type="submit" disabled={isSubmitting}>{isSubmitting ? t('processing') : 'Submit KYC'}</Button>
            </form>
        </div>
    );
};

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactElement }> = ({ title, value, icon }) => (
    <div className="bg-white dark:bg-neutral-700 p-4 rounded-lg border border-neutral-200 dark:border-neutral-600 flex items-center space-x-3">
        <div className="flex-shrink-0 bg-primary/10 p-3 rounded-full">{icon}</div>
        <div>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">{title}</p>
            <p className="text-xl font-bold text-neutral-800 dark:text-neutral-100">{value}</p>
        </div>
    </div>
);


const SupplierDashboardScreen: React.FC<SupplierViewProps & { goToTab?: (name: string) => void, openKycForm?: () => void, kycStatus?: string | null }> = ({ navigate, goToTab, openKycForm, kycStatus }) => {
    const { user, logout } = useAuth();
    const { bookings } = useBooking();
    const { items } = useItem();
    const { reviews } = useReview();
    const { t } = useLanguage();

    const supplierItems = useMemo(() => items.filter(i => i.ownerId === user?.id), [items, user]);
    const supplierItemIds = useMemo(() => supplierItems.map(i => i.id), [supplierItems]);

    const totalEarnings = useMemo(() => {
        return bookings
            .filter(b => supplierItemIds.includes(b.itemId!) && b.status === 'Completed')
            .reduce((acc, booking) => acc + (booking.finalPrice || 0), 0);
    }, [bookings, supplierItemIds]);

    const { avgRating, totalReviews } = useMemo(() => {
        const relevantReviews = reviews.filter(r => r.itemId && supplierItemIds.includes(r.itemId));
        if (relevantReviews.length === 0) return { avgRating: 0, totalReviews: 0 };
        const total = relevantReviews.reduce((acc, r) => acc + r.rating, 0);
        return {
            avgRating: total / relevantReviews.length,
            totalReviews: relevantReviews.length,
        };
    }, [reviews, supplierItemIds]);
    
    const popularItems = useMemo(() => {
        const bookingCounts = bookings.reduce((acc, booking) => {
            if (booking.itemId && supplierItemIds.includes(booking.itemId)) {
                acc[booking.itemId] = (acc[booking.itemId] || 0) + 1;
            }
            return acc;
        }, {} as Record<number, number>);

        return Object.entries(bookingCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([itemId, count]) => {
                const item = items.find(i => i.id === Number(itemId));
                return { name: item?.name || 'Unknown Item', count };
            });

    }, [bookings, items, supplierItemIds]);

    const ProfileLink: React.FC<{ label: string, onClick: () => void, icon?: React.ReactElement }> = ({ label, onClick, icon }) => (
         <button onClick={onClick} className="w-full text-left p-4 bg-white dark:bg-neutral-800 flex justify-between items-center hover:bg-neutral-50 dark:hover:bg-neutral-600 transition-colors">
            <span className="font-semibold text-neutral-800 dark:text-neutral-100">{label}</span>
            {icon || <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-neutral-500 dark:text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>}
        </button>
    );

    return (
        <div className="p-4 space-y-6 dark:text-neutral-200">
             <div className="bg-white dark:bg-neutral-700 p-6 rounded-lg border border-neutral-200 dark:border-neutral-600 flex items-center space-x-4">
                <div className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center text-3xl font-bold flex-shrink-0">
                    {user?.name.charAt(0)}
                </div>
                <div>
                    <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100">{t('welcome')}, {user?.name}!</h2>
                    <p className="text-neutral-700 dark:text-neutral-300 text-sm">{user?.email}</p>
                    {user?.status === 'pending' && <p className="text-yellow-700 mt-2 text-xs p-2 bg-yellow-100 rounded-md">Your account is pending admin approval.</p>}
                    {kycStatus === 'Submitted' && (
                        <p className="text-yellow-700 mt-2 text-xs p-2 bg-yellow-100 rounded-md">KYC submitted. Verification pending.</p>
                    )}
                    {!kycStatus && (
                        <div className="mt-2 flex items-center gap-2">
                            <p className="text-xs text-neutral-700 dark:text-neutral-300">Complete KYC to speed up approval.</p>
                            <button onClick={openKycForm} className="text-xs px-2 py-1 bg-primary text-white rounded-md">Start KYC</button>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <StatCard 
                    title={t('totalEarnings')}
                    value={`₹${totalEarnings.toLocaleString()}`} 
                    icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01" /></svg>}
                />
                 <StatCard 
                    title={t('avgRating')}
                    value={avgRating > 0 ? `${avgRating.toFixed(1)}/5` : 'N/A'}
                    icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>}
                />
            </div>
            
            <div className="bg-white dark:bg-neutral-700 p-4 rounded-lg border border-neutral-200 dark:border-neutral-600">
                <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100 mb-2">{t('mostPopularItems')}</h3>
                {popularItems.length > 0 ? (
                    <ul className="space-y-2">
                        {popularItems.map((item, index) => (
                             <li key={index} className="flex justify-between items-center text-sm p-2 bg-neutral-50 dark:bg-neutral-600 rounded-md">
                                <span className="font-semibold text-neutral-800 dark:text-neutral-100">{index + 1}. {item.name}</span>
                                <span className="font-bold text-primary">{item.count} bookings</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-center text-sm text-neutral-500 py-4">No bookings yet to determine popularity.</p>
                )}
            </div>
            
            <div className="space-y-4">
                 <div className="bg-white dark:bg-neutral-700 rounded-lg border border-neutral-200 dark:border-neutral-600 overflow-hidden divide-y divide-neutral-200 dark:divide-neutral-600">
                     <h3 className="p-4 text-lg font-bold text-neutral-800 dark:text-neutral-100">{t('profile')}</h3>
                     <ProfileLink label={t('myAccount')} onClick={() => navigate({ view: 'MY_ACCOUNT' })} />
                     <ProfileLink label={t('paymentHistory')} onClick={() => navigate({ view: 'PAYMENT_HISTORY' })} />
                     <ProfileLink label={t('bookings')} onClick={() => goToTab ? goToTab('bookings') : navigate({ view: 'PAYMENT_HISTORY' })} />
                     <ProfileLink label={t('settings')} onClick={() => navigate({ view: 'SETTINGS' })} />
                     <ProfileLink label={t('raiseAComplaint')} onClick={() => navigate({ view: 'SUPPORT' })} />
                     <ProfileLink label={t('privacyPolicy')} onClick={() => navigate({ view: 'POLICY' })} />
                 </div>
                 <Button onClick={logout} variant="secondary">{t('logout')}</Button>
            </div>
        </div>
    )
}

const supplierNavItems: NavItemConfig[] = [
    { name: 'requests', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> },
    { name: 'bookings', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg> },
    { name: 'schedule', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
    { name: 'listings', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg> },
    { name: 'dashboard', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
];

const SupplierView: React.FC<SupplierViewProps> = ({ navigate }) => {
    const [view, setView] = useState<'TABS' | 'ADD_ITEM'>('TABS');
    const [activeTab, setActiveTab] = useState('dashboard');
    const [itemToEdit, setItemToEdit] = useState<Item | null>(null);
    const { user } = useAuth();
    const { getUnreadMessageCount } = useChat();
    const { bookings } = useBooking();
    const { t } = useLanguage();
    const unreadChatCount = user ? getUnreadMessageCount(user.id) : 0;
    const [kycStatus, setKycStatus] = useState<string | null>(null);
    const [showKycForm, setShowKycForm] = useState(false);

    useEffect(() => {
        const loadKyc = async () => {
            if (!user) return;
            try {
                const { data } = await supabase.from('kycSubmissions').select('status').eq('userId', user.id).limit(1);
                const status = (data && data[0] && (data[0] as any).status) || null;
                setKycStatus(status);
            } catch {
                setKycStatus(null);
            }
        };
        loadKyc();
    }, [user, activeTab]);

    const hasActiveBookings = useMemo(() => {
        if (!user) return false;
        return bookings.some(b => (b.supplierId === user.id || b.operatorId === user.id) && ['Confirmed', 'Arrived', 'In Process'].includes(b.status));
    }, [bookings, user]);

    const handleAddItem = useCallback(() => {
        setItemToEdit(null);
        setView('ADD_ITEM');
    }, []);

    const handleEditItem = useCallback((item: Item) => {
        setItemToEdit(item);
        setView('ADD_ITEM');
    }, []);
    
    const handleBackToDashboard = useCallback(() => {
        setView('TABS');
        setItemToEdit(null);
    }, []);
    
    const renderContent = () => {
        switch(activeTab) {
            case 'dashboard': return <SupplierDashboardScreen navigate={navigate} goToTab={setActiveTab} openKycForm={() => setShowKycForm(true)} kycStatus={kycStatus} />;
            case 'requests': return <SupplierRequestsScreen />;
            case 'bookings': return <SupplierBookingsScreen navigate={navigate} />;
            case 'schedule': return <SupplierScheduleScreen />;
            case 'listings':
                return <SupplierListingsScreen onAddItem={handleAddItem} onEditItem={handleEditItem} />;
            default: return <SupplierDashboardScreen navigate={navigate}/>;
        }
    }

    if (view === 'ADD_ITEM') {
        return <AddItemScreen itemToEdit={itemToEdit} onBack={handleBackToDashboard} />;
    }

    if (showKycForm) {
        return <SupplierKycForm onSubmitted={() => { setShowKycForm(false); setKycStatus('Submitted'); }} />;
    }

    return (
        <div className="pb-20">
            <Header title={t(activeTab as TranslationKey)}>
                {hasActiveBookings && (
                    <button onClick={() => navigate({ view: 'CONVERSATIONS' })} className="relative p-2 text-neutral-700 dark:text-neutral-300 hover:text-primary rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-700" aria-label="Open Chats">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        {unreadChatCount > 0 && (
                            <span className="absolute top-1 right-1 flex h-3 w-3">
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                            </span>
                        )}
                    </button>
                )}
                <NotificationBell />
            </Header>
            {renderContent()}
            <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} navItems={supplierNavItems} />
        </div>
    );
};

export default SupplierView;
