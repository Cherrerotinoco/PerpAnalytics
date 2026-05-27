import { useEffect } from 'react';
import * as CookieConsent from 'vanilla-cookieconsent';
import 'vanilla-cookieconsent/dist/cookieconsent.css';

// ─── GTM Consent Mode helpers ──────────────────────────────────────────────────
declare function gtag(...args: unknown[]): void;

const grantAnalytics = () => {
  if (typeof gtag === 'function') {
    gtag('consent', 'update', { analytics_storage: 'granted' });
  }
};

const denyAnalytics = () => {
  if (typeof gtag === 'function') {
    gtag('consent', 'update', { analytics_storage: 'denied' });
  }
};

// ─── Hook ──────────────────────────────────────────────────────────────────────
export const useCookieConsent = () => {
  useEffect(() => {
    CookieConsent.run({
      // Persist consent choice across sessions
      cookie: { name: 'pa_cookie_consent' },

      // Show the banner again if the privacy policy changes
      revision: 1,

      guiOptions: {
        consentModal: {
          layout: 'box',
          position: 'bottom right',
          equalWeightButtons: false,
          flipButtons: false,
        },
        preferencesModal: {
          layout: 'box',
          equalWeightButtons: true,
          flipButtons: false,
        },
      },

      onConsent: ({ cookie }) => {
        if (cookie.categories.includes('analytics')) {
          grantAnalytics();
        }
      },

      onChange: ({ cookie }) => {
        if (cookie.categories.includes('analytics')) {
          grantAnalytics();
        } else {
          denyAnalytics();
        }
      },

      categories: {
        necessary: {
          // Always enabled, cannot be toggled off
          enabled: true,
          readOnly: true,
        },
        analytics: {
          enabled: false,
          autoClear: {
            // Remove GA cookies if the user opts out
            cookies: [
              { name: /^_ga/ },
              { name: '_gid' },
            ],
          },
        },
      },

      language: {
        default: 'en',
        translations: {
          en: {
            consentModal: {
              title: 'We use cookies',
              description:
                'We use analytics cookies to understand how you use PerpsAnalytics and improve the experience. You can choose to accept or decline below.',
              acceptAllBtn: 'Accept all',
              acceptNecessaryBtn: 'Decline',
              showPreferencesBtn: 'Manage preferences',
              footer: '<a href="/cookie-policy">Cookie Policy</a>',
            },
            preferencesModal: {
              title: 'Cookie preferences',
              acceptAllBtn: 'Accept all',
              acceptNecessaryBtn: 'Decline all',
              savePreferencesBtn: 'Save preferences',
              closeIconLabel: 'Close',
              sections: [
                {
                  title: 'Strictly necessary',
                  description:
                    'These cookies are required for the site to function. They cannot be disabled.',
                  linkedCategory: 'necessary',
                },
                {
                  title: 'Analytics',
                  description:
                    'Google Tag Manager / Google Analytics. These cookies help us understand how visitors interact with the site. No personal data is sold or shared.',
                  linkedCategory: 'analytics',
                },
                {
                  title: 'More information',
                  description:
                    'For more details on how we use cookies, see our <a href="/cookie-policy">Cookie Policy</a>.',
                },
              ],
            },
          },
        },
      },
    });
  }, []);
};
