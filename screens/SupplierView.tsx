
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Line } from 'recharts';
import BottomNav, { NavItemConfig } from '../components/BottomNav';
import { SupplierRequestsScreen } from './SupplierRequestsScreen';
import { useChat } from '../context/ChatContext';
import { useToast } from '../context/ToastContext';
import SupplierBookingsScreen from './SupplierBookingsScreen';
import { useBooking } from '../context/BookingContext';
import { useReview } from '../context/ReviewContext';
import SupplierScheduleScreen from './SupplierScheduleScreen';
import { supabase } from '../lib/supabase';
import { GoogleGenAI } from "@google/genai";
import { useLanguage } from '../context/LanguageContext';

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
    const { user } = useAuth();
    const { updateUser } = useAuth();
    const { addItem, updateItem } = useItem();
    const { showToast } = useToast();
    const { bookings } = useBooking();
    const { items } = useItem();

    const [name, setName] = useState('');
    const [purposes, setPurposes] = useState<{ name: WorkPurpose, price: string }[]>([{ name: WORK_PURPOSES[0], price: '' }]);
    const [category, setCategory] = useState<ItemCategory>(itemToEdit?.category || ItemCategory.Tractors);
    const [location, setLocation] = useState('');
    const [itemGeo, setItemGeo] = useState<{ lat: number; lng: number } | null>(null);
    const [itemMapCenter, setItemMapCenter] = useState<[number, number]>([17.3850, 78.4867]);
    const itemMapRef = useRef<any>(null);
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
    const [autoPriceOptimization, setAutoPriceOptimization] = useState(false);
    const [showKyc, setShowKyc] = useState(false);
    const [aadharImageUrl, setAadharImageUrl] = useState('');
    const [personalPhotoUrl, setPersonalPhotoUrl] = useState('');
    const [supplierPhone, setSupplierPhone] = useState('');
    const [supplierEmail, setSupplierEmail] = useState('');
    const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);

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
            if (itemToEdit.locationCoords) {
                setItemGeo(itemToEdit.locationCoords);
                setItemMapCenter([itemToEdit.locationCoords.lat, itemToEdit.locationCoords.lng]);
            }
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
        setShowKyc(false);
    }, [itemToEdit]);

    useEffect(() => {
        if (!('geolocation' in navigator)) return;
        navigator.geolocation.getCurrentPosition(pos => {
            const { latitude, longitude } = pos.coords;
            setCurrentLocation({ lat: latitude, lng: longitude });
        });
    }, []);
    
    const handleKycFileSelect = (type: 'aadhar' | 'personal') => (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const url = reader.result as string;
            if (type === 'aadhar') setAadharImageUrl(url);
            else setPersonalPhotoUrl(url);
        };
        reader.readAsDataURL(file);
    };

    const handleKycSave = async () => {
        if (!user) return;
        await updateUser({
            ...user,
            aadharImageUrl,
            personalPhotoUrl,
            phone: supplierPhone || user.phone,
            email: supplierEmail || user.email,
        });
        setShowKyc(false);
    };
    
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
            showToast('Please upload up to 3 images only.', 'error');
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
        if (!itemGeo) {
            showToast('Please select a location on the map.', 'error');
            return;
        }
        
        const defaultImages = {
            Male: 'https://images.unsplash.com/photo-1591181825852-f4a45a6c3a81?q=80&w=800&auto=format&fit=crop',
            Female: 'https://images.unsplash.com/photo-1601758123926-4cf339f4c278?q=80&w=800&auto=format&fit=crop'
        };
        const itemImages = category === ItemCategory.Workers ? [defaultImages[gender]] : imagePreviews;

        const itemData: Omit<Item, 'id'> = {
            name,
            category,
            purposes: validPurposes.map(p => ({ name: p.name, price: parseFloat(p.price) })),
            images: itemImages,
            ownerId: user.id,
            location,
            locationCoords: itemGeo || undefined,
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
            autoPriceOptimization
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
            <Header title={itemToEdit ? 'Edit Item' : 'Add Item'} onBack={onBack} />
            
            <form className="p-4 space-y-4" onSubmit={handleSave}>
                 {category !== ItemCategory.Workers && (
                    <div>
                        <label className="block text-neutral-700 dark:text-neutral-300 text-sm font-bold mb-2">Item Image <span className="text-red-600">*</span></label>
                        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-md">
                            <div className="space-y-1 text-center">
                                {imagePreviews.length > 0 ? (
                                    <div className="flex flex-wrap justify-center gap-2">
                                        {imagePreviews.map((img, i) => (
                                            img && img.trim() !== '' ? (
                                                <img key={i} src={img} alt={`Preview ${i+1}`} className="h-20 w-28 object-cover rounded-md" />
                                            ) : null
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
                <div>
                    <label className="block text-neutral-700 dark:text-neutral-300 text-sm font-bold mb-2">Select Item Location on Map <span className="text-red-600">*</span></label>
                    <div className="rounded overflow-hidden border border-neutral-200 dark:border-neutral-600">
                        <MapContainer center={itemMapCenter} zoom={12} scrollWheelZoom={true} style={{ height: '220px', width: '100%' }}
                            whenCreated={(map) => {
                                itemMapRef.current = map;
                                map.on('click', (e: any) => {
                                    const { lat, lng } = e.latlng;
                                    setItemGeo({ lat, lng });
                                    setLocation(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
                                });
                            }}>
                            <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            {currentLocation && (
                                <Marker
                                    position={[currentLocation.lat, currentLocation.lng]}
                                    icon={new L.DivIcon({
                                        html: '<div class="w-4 h-4 rounded-full bg-green-600 ring-2 ring-white"></div>',
                                        className: '',
                                        iconSize: [16, 16],
                                        iconAnchor: [8, 8],
                                    })}
                                />
                            )}
                            <Marker 
                                position={itemGeo ? [itemGeo.lat, itemGeo.lng] : itemMapCenter}
                                icon={L.icon({
                                    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                                    iconSize: [25, 41],
                                    iconAnchor: [12, 41],
                                    popupAnchor: [1, -34],
                                    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
                                    shadowSize: [41, 41]
                                })}
                                draggable
                                eventHandlers={{
                                    dragend: (e: any) => {
                                        const latlng = e.target.getLatLng();
                                        setItemGeo({ lat: latlng.lat, lng: latlng.lng });
                                        setLocation(`${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`);
                                    }
                                }}
                            />
                        </MapContainer>
                    </div>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">Tap the map or drag the pin to set location.</p>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">This makes the supplier listing location selection intuitive: tap or drag the pin to choose the exact point on the map, and the item save enforces having a selected location</p>
                    {itemGeo && <p className="text-xs text-neutral-600 dark:text-neutral-400">Selected: {itemGeo.lat.toFixed(5)}, {itemGeo.lng.toFixed(5)}</p>}
                </div>
                 <div>
                    <label className="block text-neutral-700 dark:text-neutral-300 text-sm font-bold mb-2">Category</label>
                    <select value={category} onChange={e => setCategory(e.target.value as ItemCategory)} className="shadow appearance-none border border-neutral-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg w-full py-3 px-4 text-neutral-800 dark:text-white leading-tight focus:outline-none focus:ring-2 focus:ring-primary/50">
                        {Object.values(ItemCategory).map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                {/* Work Purposes Section */}
                 <div className="space-y-3 p-3 border border-neutral-200 dark:border-neutral-600 rounded-lg">
                    <h3 className="font-bold text-neutral-800 dark:text-neutral-100">Work Purposes & Pricing</h3>
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
                                    {isSuggestingPrice ? 'Analyzing...' : 'AI Suggest Price'}
                                </button>
                            </div>
                        </div>
                    ))}
                    <Button type="button" variant="secondary" onClick={addPurpose} className="w-full text-sm py-2" disabled={purposes.length >= WORK_PURPOSES.length}>
                        + Add Another Purpose
                    </Button>
                </div>

                {isWorker && (
                    <div>
                        <label className="block text-neutral-700 dark:text-neutral-300 text-sm font-bold mb-2">Gender</label>
                        <select value={gender} onChange={e => setGender(e.target.value as 'Male' | 'Female')} className="shadow appearance-none border border-neutral-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg w-full py-3 px-4 text-neutral-800 dark:text-white leading-tight focus:outline-none focus:ring-2 focus:ring-primary/50">
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                        </select>
                        <p className="text-xs text-neutral-500 mt-1">A default image will be assigned based on gender.</p>
                    </div>
                )}
                <div>
                     <label className="block text-neutral-700 dark:text-neutral-300 text-sm font-bold mb-2">Description</label>
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
                <div className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-900/40 rounded-lg border border-neutral-200 dark:border-neutral-600">
                    <div>
                        <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100">Auto Price Optimization</p>
                        <p className="text-xs text-neutral-600 dark:text-neutral-300">Adjust prices based on demand and season</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={autoPriceOptimization}
                      onClick={() => setAutoPriceOptimization(prev => !prev)}
                      className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${autoPriceOptimization ? 'bg-primary' : 'bg-neutral-200'}`}
                    >
                      <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${autoPriceOptimization ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
                {isWorker && (
                     <Input label="Available Quantity" type="number" value={quantityAvailable} onChange={e => setQuantityAvailable(e.target.value)} placeholder="e.g., 10" required min="0" />
                )}
                <Button type="submit">{itemToEdit ? 'Save Changes' : 'Submit for Approval'}</Button>
            </form>
        </div>
    );
};

const SupplierListingsScreen: React.FC<{ onAddItem: () => void, onEditItem: (m: Item) => void }> = ({ onAddItem, onEditItem }) => {
    const { user } = useAuth();
    const { items, deleteItem, updateItem } = useItem();
    const { bookings } = useBooking();
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

    const optimizePrices = (item: Item) => {
        const seasonBoost = (() => {
            const m = new Date().getMonth() + 1
            if ([9,10,11].includes(m)) return 1.15
            if ([3,4,5].includes(m)) return 1.1
            return 1
        })()
        const demandBoost = (() => {
            const count = bookings.filter(b => b.itemId === item.id && ['Confirmed','Completed','Pending Payment','Arrived','In Process'].includes(b.status)).length
            if (count > 10) return 1.2
            if (count > 5) return 1.1
            return 1
        })()
        const competitorAvg = (() => {
            const peers = items.filter(i => i.category === item.category && i.location === item.location && i.id !== item.id)
            const prices = peers.flatMap(p => p.purposes.map(x => x.price))
            if (prices.length === 0) return undefined
            return prices.reduce((a,b)=>a+b,0)/prices.length
        })()
        const updatedPurposes = item.purposes.map(p => {
            const base = p.price
            const adjusted = Math.round(base * seasonBoost * demandBoost)
            if (competitorAvg && adjusted < competitorAvg * 0.9) return { ...p, price: Math.round(competitorAvg * 0.95) }
            return { ...p, price: adjusted }
        })
        updateItem({ ...item, purposes: updatedPurposes })
    }

    return (
        <div className="dark:text-neutral-200">
            <div className="p-4">
                 <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100">My Items & Services</h2>
                    <button onClick={handleAddItemClick} className="bg-primary text-white font-bold py-2 px-4 rounded-lg hover:bg-primary-dark transition-colors">+ Add Item</button>
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
                                 <div className="text-right mt-4 border-t border-neutral-100 dark:border-neutral-600 pt-3 flex justify-end space-x-2">
                                    <button onClick={() => onEditItem(item)} className="bg-primary text-white font-bold py-1 px-3 rounded-lg text-sm hover:bg-primary-dark transition-colors">Edit</button>
                                    <button onClick={() => setItemToDelete(item)} className="bg-red-600 text-white font-bold py-1 px-3 rounded-lg text-sm hover:bg-red-700 transition-colors">Delete</button>
                                    <button onClick={() => optimizePrices(item)} className="bg-blue-600 text-white font-bold py-1 px-3 rounded-lg text-sm hover:bg-blue-700 transition-colors">Optimize Now</button>
                                    <span className={`text-xs px-2 py-1 rounded-md ${item.autoPriceOptimization ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-600'}`}>{item.autoPriceOptimization ? 'Auto Opt: On' : 'Auto Opt: Off'}</span>
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
                    title="Delete Item"
                    message={`Are you sure you want to delete "${itemToDelete.name}"?`}
                    confirmText="Delete"
                    cancelText="Cancel"
                    onConfirm={handleConfirmDelete}
                    onCancel={() => setItemToDelete(null)}
                />
            )}
        </div>
    )
}

const SupplierKycInlineForm: React.FC<{ onSubmitted: () => void }> = ({ onSubmitted }) => {
    const { user } = useAuth();
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [location, setLocation] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [aadhaarPreview, setAadhaarPreview] = useState<string>('');
    const [photoPreview, setPhotoPreview] = useState<string>('');
    const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
    const [center, setCenter] = useState<[number, number]>([17.3850, 78.4867]);
    const mapRef = useRef<any>(null);

    useEffect(() => {
        if (user) {
            setFullName(user.name || '');
            setPhone(user.phone || '');
            setLocation((user as any).location || '');
        }
    }, [user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setIsSubmitting(true);
        try {
            const docs = [
                aadhaarPreview ? { type: 'Aadhaar', url: aadhaarPreview, status: 'Submitted' } : null,
                photoPreview ? { type: 'Photo', url: photoPreview, status: 'Submitted' } : null,
            ].filter(Boolean) as any[];
            await supabase.from('kycSubmissions').upsert([{ userId: user.id, status: 'Pending', submittedAt: new Date().toISOString(), docs, geo }], { onConflict: 'userId' });
            onSubmitted();
        } finally {
            setIsSubmitting(false);
        }
    };

    const readFileAsDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    const onAadhaarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const url = await readFileAsDataUrl(file);
        setAadhaarPreview(url);
    };
    const onPhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const url = await readFileAsDataUrl(file);
        setPhotoPreview(url);
    };
    const itemIcon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        shadowSize: [41, 41]
    });

    useEffect(() => {
        if (!('geolocation' in navigator)) return;
        navigator.geolocation.getCurrentPosition(pos => {
            const { latitude, longitude } = pos.coords;
            setGeo({ lat: latitude, lng: longitude });
            setCenter([latitude, longitude]);
            if (mapRef.current) mapRef.current.setView([latitude, longitude], 14);
        });
    }, []);

    const canSubmit = Boolean(aadhaarPreview && photoPreview && geo);
    return (
        <form className="space-y-4" onSubmit={handleSubmit}>
            <Input label="Full Name" value={fullName} onChange={e => setFullName(e.target.value)} required />
            <Input label="Phone" value={phone} onChange={e => setPhone(e.target.value)} required />
            <div>
                <label className="block text-neutral-700 dark:text-neutral-300 text-sm font-bold mb-2">Select Location on Map <span className="text-red-600">*</span></label>
                <div className="rounded overflow-hidden border border-neutral-200 dark:border-neutral-600">
                    <MapContainer center={center} zoom={12} scrollWheelZoom={true} style={{ height: '220px', width: '100%' }}
                        whenCreated={(map) => {
                            mapRef.current = map;
                            map.on('click', (e: any) => {
                                const { lat, lng } = e.latlng;
                                setGeo({ lat, lng });
                                setLocation(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
                            });
                        }}>
                        <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <Marker 
                            position={geo ? [geo.lat, geo.lng] : center} 
                            icon={itemIcon}
                            draggable
                            eventHandlers={{
                                dragend: (e: any) => {
                                    const latlng = e.target.getLatLng();
                                    setGeo({ lat: latlng.lat, lng: latlng.lng });
                                    setLocation(`${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`);
                                }
                            }}
                        />
                    </MapContainer>
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">Drag the pin or tap the map to set location.</p>
                {geo && <p className="text-xs text-neutral-600 dark:text-neutral-400">Selected: {geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}</p>}
            </div>
            <div>
                <label className="block text-neutral-700 dark:text-neutral-300 text-sm font-bold mb-2">Aadhaar Image <span className="text-red-600">*</span></label>
                {aadhaarPreview && <img src={aadhaarPreview} alt="Aadhaar" className="h-24 w-32 object-cover rounded-md mb-2" />}
                <input type="file" accept="image/*" capture="environment" required onChange={onAadhaarSelect} className="shadow appearance-none border border-neutral-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg w-full py-2 px-3 text-neutral-800 dark:text-white" />
            </div>
            <div>
                <label className="block text-neutral-700 dark:text-neutral-300 text-sm font-bold mb-2">Live Photo <span className="text-red-600">*</span></label>
                {photoPreview && <img src={photoPreview} alt="Live" className="h-24 w-24 object-cover rounded-full mb-2" />}
                <input type="file" accept="image/*" capture="user" required onChange={onPhotoSelect} className="shadow appearance-none border border-neutral-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg w-full py-2 px-3 text-neutral-800 dark:text-white" />
            </div>
            
            <Button type="submit" disabled={isSubmitting || !canSubmit}>{isSubmitting ? 'Processing...' : 'Submit KYC'}</Button>
        </form>
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


const SupplierDashboardScreen: React.FC<SupplierViewProps & { goToTab?: (name: string) => void }> = ({ navigate, goToTab }) => {
    const { user, logout } = useAuth();
    const { bookings, damageReports } = useBooking();
    const { items } = useItem();
    const { reviews } = useReview();
    const { t } = useLanguage();
    const [showWeeklyTrend, setShowWeeklyTrend] = useState(false);

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

    const performance = useMemo(() => {
        const supplierBookings = bookings.filter(b => b.itemId && supplierItemIds.includes(b.itemId))
        const total = supplierBookings.length || 1
        const arrived = supplierBookings.filter(b => b.status === 'Arrived').length
        const confirmed = supplierBookings.filter(b => b.status === 'Confirmed').length
        const completed = supplierBookings.filter(b => b.status === 'Completed').length
        const acceptanceRatio = confirmed / total
        const onTimeRatio = arrived / total
        const averageRating = avgRating || 0
        const complaints = damageReports.filter(d => d.itemId && supplierItemIds.includes(d.itemId)).length
        const complaintRatio = complaints / total
        const conditionScore = (() => {
            const conds = items.filter(i => supplierItemIds.includes(i.id)).map(i => i.condition)
            if (conds.length === 0) return 0.8
            const map: Record<string, number> = { New: 1, Good: 0.9, Fair: 0.75 }
            return conds.reduce((a,c) => a + (map[c || 'Good'] || 0.9), 0) / conds.length
        })()
        const score = Math.max(0, Math.min(100,
            Math.round(
                acceptanceRatio * 25 +
                onTimeRatio * 25 +
                (averageRating / 5) * 25 +
                conditionScore * 15 -
                complaintRatio * 10
            )
        ))
        return { score, acceptanceRatio, onTimeRatio, averageRating, complaintRatio }
    }, [bookings, supplierItemIds, avgRating, damageReports, items])
    const finance = useMemo(() => {
        const completed = bookings.filter(b => b.itemId && supplierItemIds.includes(b.itemId) && b.status === 'Completed')
        const byDay: Record<string, number> = {}
        const byItem: Record<number, number> = {}
        completed.forEach(b => {
            const d = new Date(b.paymentDetails?.paymentDate || new Date().toISOString())
            const key = d.toISOString().split('T')[0]
            const amt = b.supplierPaymentAmount || b.finalPrice || 0
            byDay[key] = (byDay[key] || 0) + amt
            if (b.itemId) byItem[b.itemId] = (byItem[b.itemId] || 0) + amt
        })
        const todayKey = new Date().toISOString().split('T')[0]
        const dailyRevenue = byDay[todayKey] || 0
        const last7DaysKeys = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().split('T')[0] }).reverse()
        const weeklyTrend = last7DaysKeys.map(k => ({ date: k, amount: byDay[k] || 0 }))
        const machineWise = Object.entries(byItem).sort((a,b) => b[1] - a[1]).slice(0, 5).map(([id, amt]) => ({ name: items.find(i => i.id === Number(id))?.name || 'Item', amount: amt }))
        return { dailyRevenue, weeklyTrend, machineWise }
    }, [bookings, supplierItemIds, items])

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
                 <StatCard 
                    title="Performance Score"
                    value={`${performance.score}/100`}
                    icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17a1 1 0 100 2h2a1 1 0 100-2h-2zM12 3l7 7-7 11-7-11 7-7z" /></svg>}
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
            <div className="bg-white dark:bg-neutral-700 p-4 rounded-lg border border-neutral-200 dark:border-neutral-600">
                <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100 mb-2">Performance Breakdown</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-md">
                        <p className="text-neutral-600 dark:text-neutral-300">Acceptance</p>
                        <p className="font-bold text-neutral-800 dark:text-neutral-100">{Math.round(performance.acceptanceRatio * 100)}%</p>
                    </div>
                    <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-md">
                        <p className="text-neutral-600 dark:text-neutral-300">On-time Arrival</p>
                        <p className="font-bold text-neutral-800 dark:text-neutral-100">{Math.round(performance.onTimeRatio * 100)}%</p>
                    </div>
                    <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-md">
                        <p className="text-neutral-600 dark:text-neutral-300">Avg Rating</p>
                        <p className="font-bold text-neutral-800 dark:text-neutral-100">{avgRating > 0 ? `${avgRating.toFixed(1)}/5` : 'N/A'}</p>
                    </div>
                    <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-md">
                        <p className="text-neutral-600 dark:text-neutral-300">Complaints</p>
                        <p className="font-bold text-neutral-800 dark:text-neutral-100">{Math.round(performance.complaintRatio * 100)}%</p>
                    </div>
                </div>
            </div>
            <div className="bg-white dark:bg-neutral-700 p-4 rounded-lg border border-neutral-200 dark:border-neutral-600">
                <h3 className="text-lg font-bold text-neutral-800 dark:text-neutral-100 mb-2">Financial Dashboard</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-md">
                        <p className="text-neutral-600 dark:text-neutral-300">Daily Revenue</p>
                        <p className="font-bold text-neutral-800 dark:text-neutral-100">₹{finance.dailyRevenue.toLocaleString()}</p>
                    </div>
                </div>
                <div className="mt-4">
                    <button onClick={() => setShowWeeklyTrend(true)} className="w-full text-left text-sm font-bold text-primary">Weekly Trend</button>
                </div>
                <div className="mt-4">
                    <p className="text-sm font-bold text-neutral-800 dark:text-neutral-100 mb-2">Top Machines</p>
                    <div className="space-y-2">
                        {finance.machineWise.map((m, i) => (
                            <div key={i} className="flex justify-between text-sm p-2 bg-neutral-50 dark:bg-neutral-800 rounded-md">
                                <span>{m.name}</span>
                                <span className="font-bold">₹{m.amount.toLocaleString()}</span>
                            </div>
                        ))}
                        {finance.machineWise.length === 0 && (
                            <p className="text-neutral-600 dark:text-neutral-300 text-sm">No earnings yet.</p>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="space-y-4">
                 <div className="bg-white dark:bg-neutral-700 rounded-lg border border-neutral-200 dark:border-neutral-600 overflow-hidden divide-y divide-neutral-200 dark:divide-neutral-600">
                     <h3 className="p-4 text-lg font-bold text-neutral-800 dark:text-neutral-100">{t('profile')}</h3>
                     <ProfileLink label={t('myAccount')} onClick={() => navigate({ view: 'MY_ACCOUNT' })} />
                     <ProfileLink label={t('paymentHistory')} onClick={() => navigate({ view: 'PAYMENT_HISTORY' })} />
                     <ProfileLink label={t('bookingHistory')} onClick={() => navigate({ view: 'BOOKING_HISTORY' })} />
                     <ProfileLink label={t('settings')} onClick={() => navigate({ view: 'SETTINGS' })} />
                     <ProfileLink label={t('raiseAComplaint')} onClick={() => navigate({ view: 'SUPPORT' })} />
                     <ProfileLink label={t('privacyPolicy')} onClick={() => navigate({ view: 'POLICY' })} />
                 </div>
                <Button onClick={logout} variant="secondary">{t('logout')}</Button>
            </div>
        {showWeeklyTrend && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
                <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 w-[90%] max-w-xl p-4">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="font-semibold">Weekly Revenue Trend</h4>
                        <button onClick={() => setShowWeeklyTrend(false)} className="p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-700">✕</button>
                    </div>
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={finance.weeklyTrend}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis />
                                <Tooltip />
                                <Line type="monotone" dataKey="amount" stroke="#10b981" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        )}
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
    const hasKycLocal = Boolean(user && user.role === 'Supplier' && (user as any).aadharImageUrl && (user as any).personalPhotoUrl && user.phone);
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

    const hasKyc = hasKycLocal || kycStatus === 'Submitted' || kycStatus === 'Approved' || kycStatus === 'Pending';

    const hasActiveBookings = useMemo(() => {
        if (!user) return false;
        return bookings.some(b => (b.supplierId === user.id || b.operatorId === user.id) && ['Confirmed', 'Arrived', 'In Process'].includes(b.status));
    }, [bookings, user]);

    const handleAddItem = useCallback(() => {
        if (!hasKyc) {
            setActiveTab('listings');
            setShowKycForm(true);
            return;
        }
        setItemToEdit(null);
        setView('ADD_ITEM');
    }, [hasKyc]);

    const handleEditItem = useCallback((item: Item) => {
        if (!hasKyc) {
            setActiveTab('listings');
            setShowKycForm(true);
            return;
        }
        setItemToEdit(item);
        setView('ADD_ITEM');
    }, [hasKyc]);
    
    const handleBackToDashboard = useCallback(() => {
        setView('TABS');
        setItemToEdit(null);
    }, []);
    
    const renderContent = () => {
        switch(activeTab) {
            case 'dashboard': return <SupplierDashboardScreen navigate={navigate} goToTab={setActiveTab} />;
            case 'requests': return <SupplierRequestsScreen />;
            case 'bookings': return <SupplierBookingsScreen navigate={navigate} />;
            case 'schedule': return <SupplierScheduleScreen />;
            case 'listings':
                if (!hasKyc) {
                    if (!showKycForm) {
                        return (
                            <div className="p-4">
                                <div className="bg-white dark:bg-neutral-700 p-6 rounded-lg border border-neutral-200 dark:border-neutral-600">
                                    <h2 className="text-xl font-bold text-neutral-800 dark:text-neutral-100 mb-2">Supplier KYC</h2>
                                    <p className="text-neutral-700 dark:text-neutral-300 mb-4">Please complete KYC to access Listings.</p>
                                    <Button onClick={() => setShowKycForm(true)}>Add KYC</Button>
                                </div>
                            </div>
                        );
                    }
                    return <SupplierKycInlineForm onSubmitted={() => { setShowKycForm(false); setKycStatus('Submitted'); }} />;
                }
                return <SupplierListingsScreen onAddItem={handleAddItem} onEditItem={handleEditItem} />;
            default: return <SupplierDashboardScreen navigate={navigate}/>;
        }
    }

    if (view === 'ADD_ITEM') {
        return <AddItemScreen itemToEdit={itemToEdit} onBack={handleBackToDashboard} />;
    }

    return (
        <div className="pb-20">
            <Header title={t(activeTab as any)}>
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
