const prisma = require('../utils/db');
const { getAvailability, getRoomPricing } = require('./availabilityService');

const providerBaseUrl = (process.env.AI_PROVIDER_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const providerModel = process.env.AI_PROVIDER_MODEL || 'gpt-4o-mini';

const verifiedHotelContext = {
  name: 'Hatsey Kaleb Hotel',
  location: 'Abiy Adi, Tigray Region, Ethiopia',
  phone: '+251 914 754 143',
  email: 'info@hatseykalebhotel.com',
  checkIn: '2:00 PM',
  checkOut: '11:00 AM',
  dining: 'The hotel has a restaurant serving breakfast, lunch, dinner, authentic Ethiopian cuisine, and international favorites. Room service is available 24/7.',
  services: [
    'Concierge recommendations and arrangements',
    'Room service',
    'Laundry and dry cleaning',
    'Business center support',
    'Parking and transfers',
    'Family services',
    'Accessibility support',
    'Complimentary Wi-Fi'
  ],
  booking: 'Guests can select dates, room type, guest count, and rooms in the booking flow. A booking remains pending payment until payment is completed; the assistant cannot confirm bookings or payments.'
};

const buildContext = async ({ checkIn, checkOut, roomType, guests, rooms }) => {
  const [pricing, availability] = await Promise.all([
    getRoomPricing(),
    checkIn && checkOut
      ? getAvailability({ checkIn, checkOut, roomType, guests, rooms })
      : Promise.resolve(null)
  ]);

  return {
    ...verifiedHotelContext,
    rooms: pricing.map((room) => ({
      roomType: room.roomType,
      pricePerNight: room.pricePerNight,
      inventory: room.totalRooms
    })),
    liveAvailability: availability
  };
};

const chatWithConcierge = async ({ message, history = [], bookingContext = {} }) => {
  if (!process.env.AI_PROVIDER_API_KEY) {
    const error = new Error('AI concierge is not configured. Please contact the hotel directly.');
    error.status = 503;
    throw error;
  }

  const context = await buildContext(bookingContext);
  const system = `You are the Hatsey Kaleb Hotel concierge. Answer only from the verified hotel context below and the live availability data. Never invent prices, availability, policies, services, booking confirmations, or payment confirmations. If a fact is missing, say you do not have verified information and direct the guest to contact the hotel. For booking or payment requests, direct the guest to /booking.html and explain that this chat cannot complete or confirm them. Keep answers concise, warm, and hotel-specific.\n\nVERIFIED CONTEXT:\n${JSON.stringify(context, null, 2)}`;
  const messages = [
    { role: 'system', content: system },
    ...history.slice(-8).filter((item) => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').map((item) => ({ role: item.role, content: item.content })),
    { role: 'user', content: message }
  ];

  const response = await fetch(`${providerBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.AI_PROVIDER_API_KEY}`
    },
    body: JSON.stringify({ model: providerModel, messages, temperature: 0.1, max_tokens: 450 })
  });

  if (!response.ok) {
    const providerError = await response.text();
    const error = new Error(`AI provider request failed (${response.status}).`);
    error.status = 502;
    error.providerError = providerError.slice(0, 500);
    throw error;
  }

  const result = await response.json();
  const reply = result.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    const error = new Error('AI provider returned an empty response.');
    error.status = 502;
    throw error;
  }
  return { reply, sources: ['Prisma room inventory and availability', 'Hatsey Kaleb Hotel website content'] };
};

module.exports = { chatWithConcierge, buildContext };