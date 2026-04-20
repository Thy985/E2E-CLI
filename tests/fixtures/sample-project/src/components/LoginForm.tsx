import React from 'react';

/**
 * Login Form Component
 * This component has intentional accessibility issues for testing
 */
export function LoginForm() {
  return (
    <div className="login-form">
      <h1>Login</h1>
      
      {/* Issue: Missing label for input */}
      <input id="text-field-7b8c" type="text" placeholder="Username" />
      
      {/* Issue: Missing label for input */}
      <input id="password-field-430a" type="password" placeholder="Password" />
      
      {/* Issue: Button without accessible name */}
      <button aria-label="按钮">按钮</button>
      
      {/* Issue: Image without alt attribute */}
      <img alt="图片描述" src="/logo.png" />
      
      {/* Good example */}
      <label htmlFor="email">Email</label>
      <input id="email" type="email" />
      
      {/* Good example */}
      <button aria-label="Submit form">Submit</button>
    </div>
  );
}

/**
 * User Card Component
 */
export function UserCard({ user }: { user: { name: string; avatar: string } }) {
  return (
    <div className="user-card">
      {/* Issue: Image without alt */}
      <img alt="图片描述" src={user.avatar} />
      <span>{user.name}</span>
    </div>
  );
}

/**
 * Navigation Component
 */
export function Navigation() {
  return (
    <nav>
      {/* Issue: Empty link */}
      <a href="/home"></a>
      
      {/* Good example */}
      <a href="/about">About</a>
      
      {/* Issue: Link with only image, no alt on image */}
      <a href="/profile">
        <img alt="图片描述" src="/profile-icon.png" />
      </a>
    </nav>
  );
}
