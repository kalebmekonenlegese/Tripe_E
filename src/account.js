const status = document.getElementById('account-status');
const bookingsList = document.getElementById('bookings-list');
const signInButton = document.getElementById('account-sign-in');

const renderBookings = (bookings) => {
  bookingsList.replaceChildren();

  if (!bookings.length) {
    const empty = document.createElement('article');
    empty.className = 'benefit-card';
    empty.innerHTML = '<h3>No bookings yet</h3><p>Your next stay will appear here after you complete a reservation.</p><a class="button-outline" href="booking.html">Start a booking</a>';
    bookingsList.appendChild(empty);
    return;
  }

  bookings.forEach((booking) => {
    const card = document.createElement('article');
    card.className = 'benefit-card';
    const checkIn = new Date(booking.checkIn).toLocaleDateString();
    const checkOut = new Date(booking.checkOut).toLocaleDateString();
    card.innerHTML = `<h3>${booking.roomType}</h3><p>${checkIn} - ${checkOut}</p><p>${booking.guests} guest${booking.guests === 1 ? '' : 's'} · ${booking.status}</p><p>Booking reference: <strong>${booking.id}</strong></p>`;
    bookingsList.appendChild(card);
  });
};

const loadBookings = async () => {
  if (!window.hotelAPI?.isAuthenticated()) {
    status.textContent = 'Sign in to view your reservations.';
    renderBookings([]);
    return;
  }

  status.textContent = 'Loading your reservations...';
  try {
    const result = await window.hotelAPI.getMyBookings();
    status.textContent = `${result.total || 0} reservation${result.total === 1 ? '' : 's'} found.`;
    renderBookings(result.bookings || []);
  } catch (error) {
    status.textContent = error.error || 'We could not load your reservations.';
  }
};

signInButton?.addEventListener('click', () => {
  document.querySelector('.top-actions [aria-label="Sign in"]')?.click();
  window.setTimeout(loadBookings, 900);
});

loadBookings();
