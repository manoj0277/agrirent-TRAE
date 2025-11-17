import React, { useMemo } from 'react';
import { FALLBACK_IMAGE, onImgErrorSetFallback } from '../utils/imageFallback';
import { AppView, Item, ItemCategory } from '../types';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

interface FarmerMapScreenProps {
    items: Item[];
    navigate: (view: AppView) => void;
    userLocation?: { lat: number; lng: number; };
}

const userIcon = new L.DivIcon({
    html: '<div class="w-4 h-4 rounded-full bg-green-600 ring-2 ring-white"></div>',
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
});

const ICON_COLORS: Record<ItemCategory, string> = {
    [ItemCategory.Tractors]: '#8B4513', // SaddleBrown
    [ItemCategory.Harvesters]: '#DAA520', // GoldenRod
    [ItemCategory.JCB]: '#FFC107', // Amber
    [ItemCategory.Workers]: '#0288D1', // Light Blue
    [ItemCategory.Drones]: '#455A64', // Blue Grey
    [ItemCategory.Sprayers]: '#4CAF50', // Green
    [ItemCategory.Drivers]: '#795548', // Brown
    [ItemCategory.Borewell]: '#607D8B', // Blue Grey
};
const defaultIconColor = '#475569'; // Slate 600

const getIconForItem = (category: ItemCategory) => {
    const color = ICON_COLORS[category] || defaultIconColor;
    const iconHtml = `
        <div style="background-color: ${color};" class="w-6 h-6 rounded-full flex items-center justify-center text-white shadow-lg ring-2 ring-white">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 20l-4.95-6.05a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd" />
            </svg>
        </div>`;
    
    return new L.DivIcon({
        html: iconHtml,
        className: '', // important to clear default styling
        iconSize: [24, 24],
        iconAnchor: [12, 24],
        popupAnchor: [0, -24],
    });
};


const FarmerMapScreen: React.FC<FarmerMapScreenProps> = ({ items, navigate, userLocation }) => {
    const center: [number, number] = useMemo(() => {
        if (userLocation) {
            return [userLocation.lat, userLocation.lng];
        }
        if (items.length > 0 && items[0].locationCoords) {
            return [items[0].locationCoords.lat, items[0].locationCoords.lng];
        }
        return [17.3850, 78.4867]; // Default to Hyderabad, Telangana
    }, [userLocation, items]);


    return (
        <div className="relative w-full h-full bg-neutral-200">
            <MapContainer center={center} zoom={12} scrollWheelZoom={true} style={{ height: '100%', width: '100%', minHeight: '320px' }}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* User Location Marker */}
                {userLocation && (
                    <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
                         <Popup>Your current location.</Popup>
                    </Marker>
                )}
                
                {/* Item Markers */}
                {items.map(item => {
                    if (!item.locationCoords) return null;
                    const minPrice = item.purposes.length > 0 ? Math.min(...item.purposes.map(p => p.price)) : 0;
                    return (
                        <Marker
                            key={item.id}
                            position={[item.locationCoords.lat, item.locationCoords.lng]}
                            icon={getIconForItem(item.category)}
                        >
                            <Popup>
                                <div className="w-48">
                                    <img 
                                        src={item.images[0] || FALLBACK_IMAGE} 
                                        alt={item.name} 
                                        className="w-full h-24 object-cover rounded-md mb-2"
                                        referrerPolicy="no-referrer"
                                        crossOrigin="anonymous"
                                        onError={onImgErrorSetFallback}
                                    />
                                    <h3 className="font-bold text-md leading-tight text-neutral-800">{item.name}</h3>
                                    <p className="text-sm text-neutral-600">from ₹{minPrice}/hr</p>
                                    <button
                                        onClick={() => navigate({ view: 'ITEM_DETAIL', item })}
                                        className="w-full mt-2 text-center bg-primary text-white text-sm font-semibold py-1 rounded-md hover:bg-primary-dark"
                                    >
                                        View Details
                                    </button>
                                </div>
                            </Popup>
                        </Marker>
                    )
                })}
            </MapContainer>
        </div>
    );
};

export default FarmerMapScreen;
