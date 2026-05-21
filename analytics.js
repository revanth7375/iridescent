/**
 * IRIDESCENT Boutique — Client-Side Analytics Tracker
 * Handles real-time traffic logging, localStorage persistence, and 
 * seeds mock historical data for stunning dashboard visualizations.
 */

(function () {
  // Config
  const STORAGE_KEY = 'iridescent_analytics';
  const OWNER_PASSCODE = '1234';

  // Initialize DB if not present
  function initDatabase() {
    let db = localStorage.getItem(STORAGE_KEY);
    if (!db) {
      db = {
        visitors: [],
        pageviews: [],
        events: [],
        leads: [],
        subscribers: []
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } else {
      try {
        db = JSON.parse(db);
        // Ensure all arrays exist
        if (!db.pageviews) db.pageviews = [];
        if (!db.visitors) db.visitors = [];
        if (!db.events) db.events = [];
        if (!db.leads) db.leads = [];
        if (!db.subscribers) db.subscribers = [];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      } catch (e) {
        db = {
          visitors: [],
          pageviews: [],
          events: [],
          leads: [],
          subscribers: []
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      }
    }
    return db;
  }

  // Get database
  function getDatabase() {
    let db = localStorage.getItem(STORAGE_KEY);
    if (!db) return initDatabase();
    return JSON.parse(db);
  }

  // Save database
  function saveDatabase(db) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }

  // Fetch real-time visitor location via public JSON APIs (with fallbacks)
  function fetchLiveLocation(visitorId) {
    // Try ipapi.co first (free, HTTPS supported, highly detailed)
    fetch('https://ipapi.co/json/')
      .then(response => {
        if (!response.ok) throw new Error('Primary API failed');
        return response.json();
      })
      .then(data => {
        if (data && data.city && data.country_name) {
          const loc = `${data.city}, ${data.country_name}`;
          updateVisitorLocation(visitorId, loc);
        } else {
          throw new Error('Invalid layout from primary API');
        }
      })
      .catch(error => {
        console.warn('Primary geolocation failed, trying backup API...', error);
        // Fallback to ipinfo.io
        fetch('https://ipinfo.io/json')
          .then(response => {
            if (!response.ok) throw new Error('Backup API failed');
            return response.json();
          })
          .then(data => {
            if (data && data.city && data.country) {
              const country = data.country === 'IN' ? 'India' : data.country;
              const loc = `${data.city}, ${country}`;
              updateVisitorLocation(visitorId, loc);
            } else {
              throw new Error('Invalid layout from backup API');
            }
          })
          .catch(err => {
            console.error('All geolocation APIs failed or blocked:', err);
            updateVisitorLocation(visitorId, 'Hyderabad, India (Offline)');
          });
      });
  }

  // Update visitor record in database with resolved location
  function updateVisitorLocation(visitorId, locationString) {
    const db = getDatabase();
    const visitorObj = db.visitors.find(v => v.id === visitorId);
    if (visitorObj) {
      visitorObj.location = locationString;
      saveDatabase(db);
    }
  }

  // Setup current live session tracking
  function runLiveTracker() {
    const db = getDatabase();

    // 1. Session Visitor ID
    let visitorId = sessionStorage.getItem('iridescent_visitor_uuid');
    let isNewSession = false;

    if (!visitorId) {
      // Check if they have a persistent visitor ID in localStorage
      visitorId = localStorage.getItem('iridescent_visitor_uuid');
      if (!visitorId) {
        visitorId = 'visitor_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('iridescent_visitor_uuid', visitorId);
      }
      sessionStorage.setItem('iridescent_visitor_uuid', visitorId);
      isNewSession = true;
    }

    // Capture referrer and details
    let referrer = 'Direct';
    if (document.referrer) {
      try {
        const refUrl = new URL(document.referrer);
        if (refUrl.hostname.includes('instagram.com')) referrer = 'Instagram';
        else if (refUrl.hostname.includes('pinterest.com')) referrer = 'Pinterest';
        else if (refUrl.hostname.includes('facebook.com')) referrer = 'Facebook';
        else if (refUrl.hostname.includes('google.')) referrer = 'Google Search';
        else if (refUrl.hostname !== window.location.hostname) referrer = refUrl.hostname;
      } catch (e) {
        referrer = 'Other Referral';
      }
    }

    // Detect device
    let device = 'Desktop';
    if (/Mobi|Android|iPhone/i.test(navigator.userAgent)) {
      device = 'Mobile';
    } else if (/Tablet|iPad/i.test(navigator.userAgent)) {
      device = 'Tablet';
    }

    // Log the visitor session if new or missing from the database
    let visitorObj = db.visitors.find(v => v.id === visitorId);
    let needsLocationLookup = false;

    if (!visitorObj) {
      visitorObj = {
        id: visitorId,
        timestamp: Date.now(),
        referrer,
        device,
        location: 'Detecting Location...', // Live dynamic tracking indicator
        duration: 0
      };
      db.visitors.push(visitorObj);
      saveDatabase(db);
      needsLocationLookup = true;
    } else if (visitorObj.location === 'Detecting Location...' || visitorObj.location.includes('Offline')) {
      needsLocationLookup = true;
    }

    if (needsLocationLookup) {
      fetchLiveLocation(visitorId);
    }

    // 2. Log Pageview
    let currentPath = window.location.pathname;
    // Normalize path for local file systems
    if (currentPath.includes('/')) {
      const parts = currentPath.split('/');
      currentPath = '/' + parts[parts.length - 1];
    }
    if (currentPath === '/' || currentPath === '/index.html' || currentPath === '') {
      currentPath = '/index.html';
    }

    db.pageviews.push({
      visitorId,
      path: currentPath,
      title: document.title,
      timestamp: Date.now()
    });

    saveDatabase(db);

    // 3. Active Session Duration Tracker
    let activeTime = 0;
    const durationInterval = setInterval(() => {
      activeTime += 10;
      const currentDb = getDatabase();
      const visitorObj = currentDb.visitors.find(v => v.id === visitorId);
      if (visitorObj) {
        visitorObj.duration = Math.max(visitorObj.duration || 0, activeTime);
        saveDatabase(currentDb);
      }
    }, 10000); // Update every 10s

    // Clear interval when navigating away
    window.addEventListener('beforeunload', () => {
      clearInterval(durationInterval);
    });

    // 4. Capture Custom Form Leads on contact.html
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
      contactForm.addEventListener('submit', function () {
        // Wait briefly for submit handler validations
        setTimeout(() => {
          // If form was successful (shown via display block on successMsg)
          const successMsg = document.getElementById('successMsg');
          if (successMsg && successMsg.style.display === 'block') {
            const firstName = document.getElementById('firstName').value.trim();
            const lastName = document.getElementById('lastName').value.trim();
            const email = document.getElementById('emailAddr').value.trim();
            const phone = document.getElementById('phoneNum').value.trim();
            const garmentType = document.getElementById('garmentType').value;
            const eventDate = document.getElementById('eventDate').value;
            const budgetRange = document.getElementById('budgetRange').value;
            const vision = document.getElementById('visionText').value.trim();

            const updatedDb = getDatabase();

            // Check if this lead was already captured to avoid duplication
            const alreadyExists = updatedDb.leads.some(l => l.email === email && (Date.now() - l.timestamp < 30000));
            if (!alreadyExists) {
              const newLead = {
                id: 'lead_' + Math.random().toString(36).substr(2, 9),
                first_name: firstName,
                last_name: lastName,
                email,
                phone,
                garment_type: garmentType || 'Bespoke Item',
                event_date: eventDate || 'N/A',
                budget_range: budgetRange || 'Flexible',
                vision: vision || 'Custom commission requested.',
                timestamp: Date.now()
              };

              updatedDb.leads.push(newLead);

              // Log dynamic goal conversion event
              updatedDb.events.push({
                visitorId,
                type: 'Goal_Conversion',
                label: 'Consultation Form Submitted',
                timestamp: Date.now()
              });

              saveDatabase(updatedDb);
            }
          }
        }, 1000);
      });
    }

    // 5. Intercept and Handle Newsletter Subscription on index.html
    const newsletterSection = document.querySelector('.newsletter');
    if (newsletterSection) {
      const emailInput = newsletterSection.querySelector('.email-form input[type="email"]');
      const subscribeBtn = newsletterSection.querySelector('.email-form button');

      if (subscribeBtn && emailInput) {
        subscribeBtn.addEventListener('click', function (e) {
          e.preventDefault();
          const email = emailInput.value.trim();
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

          if (!email || !emailRegex.test(email)) {
            showToast('Please enter a valid email address.', 'error');
            return;
          }

          const updatedDb = getDatabase();

          // Check if already subscribed
          const alreadySubscribed = updatedDb.subscribers.some(s => s.email.toLowerCase() === email.toLowerCase());

          if (alreadySubscribed) {
            showToast('You are already part of our Circle!', 'success');
            emailInput.value = '';
            return;
          }

          // Add subscriber
          updatedDb.subscribers.push({
            email,
            timestamp: Date.now()
          });

          // Log dynamic conversion event
          updatedDb.events.push({
            visitorId,
            type: 'Goal_Conversion',
            label: 'Newsletter Subscribed',
            timestamp: Date.now()
          });

          saveDatabase(updatedDb);

          // Change button and input visual states to look ultra premium
          const emailForm = newsletterSection.querySelector('.email-form');
          if (emailForm) {
            emailForm.innerHTML = `
              <div style="padding: 16px; border: 1px solid rgba(155, 127, 212, 0.4); background: rgba(155,127,212,0.06); color: var(--charcoal); letter-spacing: 2px; font-size: 11px; font-weight: 300; width: 100%;">
                ✦ THANK YOU FOR JOINING THE CIRCLE. WELCOME.
              </div>
            `;
          }

          showToast('Welcome to the Atelier Circle!', 'success');
        });
      }
    }

    // 6. Track saree detail page views
    if (currentPath === '/saree-detail.html') {
      const updatedDb = getDatabase();
      updatedDb.events.push({
        visitorId,
        type: 'Product_View',
        label: 'Heritage Drape',
        timestamp: Date.now()
      });
      saveDatabase(updatedDb);
    }

    // 7. Track category clicks on collection.html
    const filterButtons = document.querySelectorAll('.filter-btn');
    if (filterButtons.length > 0) {
      filterButtons.forEach(btn => {
        btn.addEventListener('click', function () {
          const category = btn.textContent.trim().toLowerCase();
          const updatedDb = getDatabase();
          updatedDb.events.push({
            visitorId,
            type: 'Filter_Change',
            label: category,
            timestamp: Date.now()
          });
          saveDatabase(updatedDb);
        });
      });
    }

    // 8. Track Product request style clicks
    const requestBtns = document.querySelectorAll('.piece-overlay a');
    if (requestBtns.length > 0) {
      requestBtns.forEach(btn => {
        btn.addEventListener('click', function () {
          const card = btn.closest('.piece-card');
          const productName = card ? card.querySelector('.piece-name').textContent : 'Unknown Piece';
          const updatedDb = getDatabase();
          updatedDb.events.push({
            visitorId,
            type: 'CTA_Click',
            label: 'Request Style: ' + productName,
            timestamp: Date.now()
          });
          saveDatabase(updatedDb);
        });
      });
    }
  }

  // Premium Toast Helper
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '30px';
    toast.style.right = '30px';
    toast.style.padding = '16px 24px';
    toast.style.background = type === 'success' ? '#1a1528' : '#c05050';
    toast.style.color = '#faf8ff';
    toast.style.fontFamily = "'Josefin Sans', sans-serif";
    toast.style.fontSize = '11px';
    toast.style.letterSpacing = '2px';
    toast.style.textTransform = 'uppercase';
    toast.style.border = type === 'success' ? '1px solid #9b7fd4' : '1px solid rgba(255,255,255,0.2)';
    toast.style.zIndex = '99999';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    toast.style.transition = 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
    toast.innerText = '✦ ' + message;

    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    }, 10);

    // Remove after 4s
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      setTimeout(() => {
        toast.remove();
      }, 400);
    }, 4000);
  }

  // Run on startup
  initDatabase();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runLiveTracker);
  } else {
    runLiveTracker();
  }
})();
