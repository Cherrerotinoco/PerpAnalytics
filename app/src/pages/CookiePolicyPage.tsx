import { Link } from 'react-router-dom';
import * as CookieConsent from 'vanilla-cookieconsent';

const CookiePolicyPage = () => (
  <div className="tc-policy-page">
    <div className="tc-policy-content">
      <Link to="/" className="tc-policy-back">
        ← Back
      </Link>

      <h1>Cookie Policy</h1>
      <p className="tc-policy-meta">Last updated: May 2025</p>

      <h2>What are cookies?</h2>
      <p>
        Cookies are small text files stored in your browser when you visit a website. They are
        widely used to make sites work, or work more efficiently, and to provide information to site
        owners.
      </p>

      <h2>What cookies do we use?</h2>

      <h3>Strictly necessary</h3>
      <p>
        These cookies are essential for the site to function. They include the cookie that stores
        your consent preferences (<code>pa_cookie_consent</code>). They cannot be disabled.
      </p>

      <table className="tc-policy-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Purpose</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>pa_cookie_consent</code>
            </td>
            <td>Stores your cookie consent preferences</td>
            <td>1 year</td>
          </tr>
        </tbody>
      </table>

      <h3>Analytics</h3>
      <p>
        If you accept analytics cookies, we use Google Tag Manager and Google Analytics to
        understand how visitors interact with the site — which pages are visited, how long sessions
        last, and similar aggregate statistics. No personal data is sold or shared with third
        parties.
      </p>

      <table className="tc-policy-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Purpose</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>_ga</code>
            </td>
            <td>Google Analytics — distinguishes users</td>
            <td>2 years</td>
          </tr>
          <tr>
            <td>
              <code>_ga_*</code>
            </td>
            <td>Google Analytics — session state</td>
            <td>2 years</td>
          </tr>
          <tr>
            <td>
              <code>_gid</code>
            </td>
            <td>Google Analytics — distinguishes users (short-lived)</td>
            <td>24 hours</td>
          </tr>
        </tbody>
      </table>

      <h2>Your choices</h2>
      <p>
        You can accept or decline analytics cookies using the banner shown on your first visit. You
        can change your preferences at any time:
      </p>
      <button
        type="button"
        className="tc-policy-prefs-btn"
        onClick={() => CookieConsent.showPreferences()}
      >
        Manage cookie preferences
      </button>

      <h2>Third-party services</h2>
      <p>
        Analytics cookies are managed by Google. You can learn more about how Google uses data at{' '}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
          policies.google.com/privacy
        </a>
        .
      </p>

      <h2>Contact</h2>
      <p>
        If you have questions about this policy, open an issue on{' '}
        <a
          href="https://github.com/Cherrerotinoco/PerpAnalytics/issues"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        .
      </p>
    </div>
  </div>
);

export default CookiePolicyPage;
