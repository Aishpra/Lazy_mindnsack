/* Lazy by The MindSnack — site interactions. No dependencies, no build step. */
(function () {
  'use strict';

  var reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fineHoverQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  var reduceMotion = reduceMotionQuery.matches;
  var isTouch = !fineHoverQuery.matches;

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function on(el, evt, handler, opts) { if (el) el.addEventListener(evt, handler, opts); }
  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  var state = { matchedPlan: 'Growth' };

  /* ---------- Preloader ---------- */
  var Preloader = {
    init: function () {
      var el = document.getElementById('preloader');
      var revealDelay = reduceMotion ? 20 : 200;
      var holdTime = reduceMotion ? 60 : 620;
      if (el) window.requestAnimationFrame(function () {
        setTimeout(function () { el.classList.add('is-in'); }, revealDelay);
      });
      setTimeout(function () {
        document.body.classList.add('is-loaded');
        if (el) {
          el.classList.add('is-out');
          setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 650);
        }
      }, holdTime);
    }
  };

  /* ---------- Navigation: header state + mobile overlay menu ---------- */
  var Navigation = {
    init: function () {
      var header = document.getElementById('siteHeader');
      var menuButton = qs('.menu-toggle');
      var mobileMenu = document.getElementById('mobileMenu');
      if (!header || !menuButton || !mobileMenu) return;

      this._header = header;
      this._menuButton = menuButton;
      this._mobileMenu = mobileMenu;
      this.updateHeader();

      menuButton.addEventListener('click', this.toggleMenu.bind(this));
      qsa('a', mobileMenu).forEach(function (link) {
        link.addEventListener('click', this.closeMenu.bind(this));
      }.bind(this));
      on(document, 'keydown', function (e) {
        if (e.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') this.closeMenu();
      }.bind(this));
    },
    updateHeader: function () {
      this._header.classList.toggle('is-scrolled', window.scrollY > 24);
    },
    toggleMenu: function () {
      var open = this._menuButton.getAttribute('aria-expanded') === 'true';
      if (open) this.closeMenu(); else this.openMenu();
    },
    openMenu: function () {
      this._mobileMenu.removeAttribute('hidden');
      this._menuButton.setAttribute('aria-expanded', 'true');
      this._menuButton.setAttribute('aria-label', 'Close navigation');
      window.requestAnimationFrame(function () { this._mobileMenu.classList.add('is-open'); }.bind(this));
    },
    closeMenu: function () {
      this._menuButton.setAttribute('aria-expanded', 'false');
      this._menuButton.setAttribute('aria-label', 'Open navigation');
      this._mobileMenu.classList.remove('is-open');
      var menu = this._mobileMenu;
      setTimeout(function () { menu.setAttribute('hidden', ''); }, reduceMotion ? 0 : 320);
    }
  };

  /* ---------- Reveal on scroll ---------- */
  var RevealObserver = {
    init: function () {
      var targets = qsa('.reveal-section');
      if (!targets.length) return;
      if (!('IntersectionObserver' in window) || reduceMotion) {
        targets.forEach(function (el) { el.classList.add('is-visible'); });
        return;
      }
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
        });
      }, { threshold: .12, rootMargin: '0px 0px -7%' });
      targets.forEach(function (el) { observer.observe(el); });
    }
  };

  /* ---------- Scroll-linked effects: progress bar, process fill, active-item tracking ---------- */
  var ScrollEffects = {
    init: function () {
      this.scrollProgress = document.getElementById('scrollProgress');
      this.progressFill = document.getElementById('progressFill');
      this.process = document.getElementById('process');
      var ticking = false;
      var run = function () {
        Navigation.updateHeader();
        this.updateScrollProgress();
        this.updateProcessFill();
        ticking = false;
      }.bind(this);
      on(window, 'scroll', function () {
        if (!ticking) { ticking = true; window.requestAnimationFrame(run); }
      }, { passive: true });
      run();

      this.initActiveTracking(qs('.process-list'), '.process-step');
      this.initActiveTracking(qs('.service-stack'), '.service-row');
    },
    updateScrollProgress: function () {
      if (!this.scrollProgress) return;
      var doc = document.documentElement;
      var max = doc.scrollHeight - doc.clientHeight;
      var progress = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
      this.scrollProgress.style.transform = 'scaleX(' + progress + ')';
    },
    updateProcessFill: function () {
      if (reduceMotion || !this.progressFill || !this.process) return;
      var rect = this.process.getBoundingClientRect();
      var progress = clamp((window.innerHeight - rect.top) / (rect.height + window.innerHeight * .25), 0, 1);
      this.progressFill.style.transform = 'scaleX(' + progress + ')';
    },
    initActiveTracking: function (container, itemSelector) {
      if (!container || !('IntersectionObserver' in window)) return;
      var items = qsa(itemSelector, container);
      if (!items.length) return;
      var sectionObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          container.classList.toggle('is-scrolling', entry.isIntersecting);
          if (entry.isIntersecting && !qs('.is-active', container)) items[0].classList.add('is-active');
        });
      }, { threshold: 0 });
      sectionObserver.observe(container);
      var itemObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) { entry.target.classList.toggle('is-active', entry.isIntersecting); });
      }, { rootMargin: '-42% 0px -42% 0px', threshold: 0 });
      items.forEach(function (item) { itemObserver.observe(item); });
    }
  };

  /* ---------- Hero orbit: connection lines + hover emphasis + subtle cursor parallax ---------- */
  var OrbitSystem = {
    init: function () {
      this.container = document.getElementById('workloadOrbit');
      this.svg = document.getElementById('orbitLines');
      this.core = document.getElementById('orbitCore');
      if (!this.container || !this.svg || !this.core) return;

      this.layoutLines();
      var resizeTimer;
      on(window, 'resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(this.layoutLines.bind(this), 150);
      }.bind(this), { passive: true });

      if (isTouch) return;
      var signals = qsa('.signal', this.container);
      signals.forEach(function (signal) {
        signal.addEventListener('pointerenter', function () { this.setActive(signal.dataset.node); }.bind(this));
        signal.addEventListener('pointerleave', this.clearActive.bind(this));
      }.bind(this));

      if (!reduceMotion) {
        var workload = qs('.workload');
        on(workload, 'mousemove', this.onCoreParallax.bind(this), { passive: true });
        on(workload, 'mouseleave', function () { this.core.style.transform = ''; }.bind(this));
      }
    },
    layoutLines: function () {
      var containerRect = this.container.getBoundingClientRect();
      var w = this.container.clientWidth, h = this.container.clientHeight;
      if (!w || !h) return;
      this.svg.setAttribute('width', w);
      this.svg.setAttribute('height', h);
      this.svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      var coreRect = this.core.getBoundingClientRect();
      var coreX = coreRect.left + coreRect.width / 2 - containerRect.left;
      var coreY = coreRect.top + coreRect.height / 2 - containerRect.top;
      this.svg.innerHTML = '';
      qsa('.signal', this.container).forEach(function (signal) {
        var r = signal.getBoundingClientRect();
        var x = r.left + r.width / 2 - containerRect.left;
        var y = r.top + r.height / 2 - containerRect.top;
        var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', coreX); line.setAttribute('y1', coreY);
        line.setAttribute('x2', x); line.setAttribute('y2', y);
        line.dataset.target = signal.dataset.node;
        this.svg.appendChild(line);
      }.bind(this));
    },
    setActive: function (node) {
      this.container.classList.add('is-active');
      qsa('.signal', this.container).forEach(function (signal) {
        signal.classList.toggle('is-emphasized', signal.dataset.node === node);
      });
      qsa('line', this.svg).forEach(function (line) {
        line.classList.toggle('is-active', line.dataset.target === node);
      });
    },
    clearActive: function () {
      this.container.classList.remove('is-active');
      qsa('.signal', this.container).forEach(function (signal) { signal.classList.remove('is-emphasized'); });
      qsa('line', this.svg).forEach(function (line) { line.classList.remove('is-active'); });
    },
    onCoreParallax: function (e) {
      var rect = qs('.workload').getBoundingClientRect();
      var relX = (e.clientX - rect.left) / rect.width - .5;
      var relY = (e.clientY - rect.top) / rect.height - .5;
      this.core.style.transform = 'translate(' + (relX * 10).toFixed(1) + 'px,' + (relY * 10).toFixed(1) + 'px)';
    }
  };

  /* ---------- Magnetic CTAs (desktop, fine pointer, motion allowed only) ---------- */
  var MagneticElements = {
    init: function () {
      if (reduceMotion || isTouch) return;
      qsa('.button-dark, .button-lime, .nav-cta').forEach(function (el) {
        on(el, 'mouseenter', function () { el.style.transition = 'transform 120ms var(--ease-smooth)'; });
        on(el, 'mousemove', function (e) {
          var rect = el.getBoundingClientRect();
          var x = clamp((e.clientX - rect.left - rect.width / 2) * .35, -7, 7);
          var y = clamp((e.clientY - rect.top - rect.height / 2) * .35, -7, 7);
          el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
        });
        on(el, 'mouseleave', function () {
          el.style.transition = 'transform 450ms var(--ease-smooth)';
          el.style.transform = '';
        });
      });
    }
  };

  /* ---------- Custom cursor (desktop, fine pointer, motion allowed only) ---------- */
  var CustomCursor = {
    init: function () {
      if (reduceMotion || isTouch) return;
      var dot = document.getElementById('cursorDot');
      var ring = document.getElementById('cursorRing');
      if (!dot || !ring) return;
      document.documentElement.classList.add('has-fine-cursor');

      var mouseX = 0, mouseY = 0, ringX = 0, ringY = 0, active = false;
      on(window, 'mousemove', function (e) {
        mouseX = e.clientX; mouseY = e.clientY;
        if (!active) { active = true; dot.classList.add('is-active'); ring.classList.add('is-active'); }
        dot.style.transform = 'translate(' + mouseX + 'px,' + mouseY + 'px) translate(-50%,-50%)';
      }, { passive: true });
      on(document, 'mouseleave', function () { dot.classList.remove('is-active'); ring.classList.remove('is-active'); active = false; });

      function loop() {
        ringX += (mouseX - ringX) * .18;
        ringY += (mouseY - ringY) * .18;
        ring.style.transform = 'translate(' + ringX.toFixed(1) + 'px,' + ringY.toFixed(1) + 'px) translate(-50%,-50%)';
        window.requestAnimationFrame(loop);
      }
      window.requestAnimationFrame(loop);

      on(document, 'mouseover', function (e) {
        var buttonEl = e.target.closest && e.target.closest('.button, .nav-cta, #quickSubmit, .package-tabs button, .menu-toggle');
        var linkEl = !buttonEl && e.target.closest && e.target.closest('a, summary, .ledger-row > a');
        ring.classList.toggle('is-button', !!buttonEl);
        ring.classList.toggle('is-link', !!linkEl);
      });
    }
  };

  /* ---------- Packages: plan data + animated switching ---------- */
  var PackageSwitcher = {
    plans: {
      starter: { label: 'Starter · Get online', price: 'Rs 24,999', period: '/ month', for: 'For small businesses that need a solid, fast website first.', term: 'Billed monthly · minimum 3 months', cta: 'Choose Starter', url: 'https://wa.me/+9779715000678?text=Hi%20MindSnack%2C%20I%27m%20interested%20in%20the%20Starter%20plan', features: [['Website', 'Up to 6 editable pages'], ['Search', 'Basic on-page SEO'], ['Content', '2 SEO articles monthly'], ['Measurement', 'Analytics and Search Console'], ['Local', 'Business Profile setup'], ['Support', 'Email support and monthly report']] },
      growth: { label: 'Growth · Get found', price: 'Rs 44,999', period: '/ month', for: 'For businesses ready to invest in steady, compounding traffic.', term: 'Billed monthly · minimum 3 months', cta: 'Choose Growth', url: 'https://wa.me/+9779715000678?text=Hi%20MindSnack%2C%20I%27m%20interested%20in%20the%20Growth%20plan', features: [['Website', 'Up to 12 conversion-ready pages'], ['Search', '20 keywords and technical SEO'], ['Content', '4 SEO articles monthly'], ['Ads', 'Google Ads management'], ['Local', 'Local SEO and schema'], ['Support', 'Dedicated PM and walkthrough']] },
      scale: { label: 'Scale · Run one system', price: 'Rs 74,999', period: '/ month', for: 'For teams that want website, search, ads and optimisation managed together.', term: 'Billed monthly · minimum 3 months', cta: 'Choose Scale', url: 'https://wa.me/+9779715000678?text=Hi%20MindSnack%2C%20I%27m%20interested%20in%20the%20Scale%20plan', features: [['Website', 'Ongoing edits and landing pages'], ['Search', '30 keywords and authority work'], ['Content', '6 SEO articles monthly'], ['Ads', 'Active campaigns and retargeting'], ['Conversion', 'Optimisation sprints'], ['Support', 'Bi-weekly strategy and dedicated PM']] },
      partner: { label: 'Partner · Built around you', price: 'Custom scope', period: '', for: 'For competitive markets and larger teams that need a tailored operating model.', term: 'Scoped after a focused discovery call', cta: 'Discuss Partner', url: 'https://wa.me/+9779715000678?text=Hi%20MindSnack%2C%20I%27d%20like%20to%20discuss%20a%20Partner%20scope', features: [['Strategy', 'Scope around the bottleneck'], ['Search', '60+ tracked keywords'], ['Content', 'Expanded editorial programme'], ['Ads', 'Full-funnel campaign support'], ['Optimisation', 'Custom workflow and CRO'], ['Support', 'Weekly strategy and priority queue']] }
    },
    init: function () {
      this.panel = document.getElementById('planPanel');
      this.price = document.getElementById('planPrice');
      this.featureGrid = document.getElementById('planFeatureGrid');
      this.tabs = qsa('.package-tabs button');
      if (!this.panel || !this.featureGrid || !this.tabs.length) return;
      this.currentKey = null;
      this.tabs.forEach(function (btn) {
        on(btn, 'click', function () { this.switchPlan(btn.dataset.plan); }.bind(this));
      }.bind(this));
      this.switchPlan('growth', true);
    },
    applyPlan: function (key) {
      var plan = this.plans[key];
      state.matchedPlan = plan.label.split(' · ')[0];
      document.getElementById('planLabel').textContent = plan.label;
      this.price.textContent = plan.price;
      document.getElementById('planPeriod').textContent = plan.period;
      document.getElementById('planFor').textContent = plan.for;
      document.getElementById('planTerm').textContent = plan.term;
      var cta = document.getElementById('planCta');
      cta.href = plan.url; cta.firstChild.textContent = plan.cta + ' ';
      this.featureGrid.innerHTML = plan.features.map(function (pair) {
        return '<div><span>' + pair[0] + '</span><b>' + pair[1] + '</b></div>';
      }).join('');
      this.tabs.forEach(function (btn) { btn.setAttribute('aria-selected', String(btn.dataset.plan === key)); });
    },
    switchPlan: function (key, isInitial) {
      if (key === this.currentKey) return;
      this.currentKey = key;
      if (reduceMotion || isInitial) {
        this.applyPlan(key);
        this.featureGrid.classList.add('is-visible');
        return;
      }
      this.panel.classList.add('is-switching');
      this.price.classList.add('is-animating');
      this.featureGrid.classList.remove('is-visible');
      setTimeout(function () {
        this.applyPlan(key);
        this.panel.classList.remove('is-switching');
        window.requestAnimationFrame(function () {
          this.price.classList.remove('is-animating');
          window.requestAnimationFrame(function () { this.featureGrid.classList.add('is-visible'); }.bind(this));
        }.bind(this));
      }.bind(this), 300);
    }
  };

  /* ---------- FAQ: keep native <details> semantics, single-open behaviour ---------- */
  var Faq = {
    init: function () {
      qsa('.faq details').forEach(function (item) {
        item.addEventListener('toggle', function () {
          if (!item.open) return;
          qsa('.faq details[open]').forEach(function (other) { if (other !== item) other.open = false; });
        });
      });
    }
  };

  /* ---------- Lead form: preserves the existing submit-lead.php contract exactly ---------- */
  var FormHandler = {
    init: function () {
      var form = document.getElementById('quickForm');
      if (!form) return;
      var phone = document.getElementById('quickPhone');
      var error = document.getElementById('phoneError');
      var pageLoadedAt = Math.floor(Date.now() / 1000);

      qsa('input', form).forEach(function (input) {
        var label = input.previousElementSibling;
        if (!label || label.tagName !== 'LABEL') return;
        on(input, 'focus', function () { label.classList.add('is-focused'); });
        on(input, 'blur', function () { label.classList.remove('is-focused'); });
      });

      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var button = document.getElementById('quickSubmit');
        var label = button.querySelector('.submit-label');
        error.textContent = ''; phone.setAttribute('aria-invalid', 'false');
        if (!phone.value.trim()) {
          error.textContent = 'Enter a phone or WhatsApp number so we can contact you.';
          phone.setAttribute('aria-invalid', 'true'); phone.focus(); return;
        }
        button.disabled = true; button.classList.add('is-loading');
        form.setAttribute('aria-busy', 'true'); label.textContent = 'Sending…';

        fetch('submit-lead.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            name: document.getElementById('quickName').value.trim(),
            phone: phone.value.trim(),
            website: document.getElementById('quickWebsite').value,
            form_ts: pageLoadedAt,
            matched_plan: state.matchedPlan,
            page_url: location.href
          })
        }).then(function (response) {
          return response.json().then(function (data) {
            if (!response.ok || !data.ok) throw new Error(data.error || 'We could not send your request. Please try WhatsApp.');
            form.classList.add('is-success');
            document.getElementById('formOk').style.display = 'block';
            qsa('input,button', form).forEach(function (el) { el.style.display = 'none'; });
            qsa('label,.form-help', form).forEach(function (el) { el.style.display = 'none'; });
          });
        }).catch(function (err) {
          error.textContent = err.message || 'We could not send your request. Please try WhatsApp.';
          button.disabled = false; button.classList.remove('is-loading'); label.textContent = 'Ask for a callback';
        }).finally(function () { form.removeAttribute('aria-busy'); });
      });
    }
  };

  function init() {
    Preloader.init();
    Navigation.init();
    RevealObserver.init();
    ScrollEffects.init();
    OrbitSystem.init();
    MagneticElements.init();
    CustomCursor.init();
    PackageSwitcher.init();
    Faq.init();
    FormHandler.init();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
