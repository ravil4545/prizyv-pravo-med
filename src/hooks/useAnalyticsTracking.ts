import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

// Generate or retrieve session ID
const getSessionId = (): string => {
  let sessionId = sessionStorage.getItem('analytics_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('analytics_session_id', sessionId);
  }
  return sessionId;
};

// Detect device type
const getDeviceType = (): string => {
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
};

// Parse user agent
const getBrowserInfo = () => {
  const ua = navigator.userAgent;
  let browser = 'Unknown';
  let os = 'Unknown';

  // Browser detection
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari')) browser = 'Safari';
  else if (ua.includes('Edge')) browser = 'Edge';
  else if (ua.includes('Opera')) browser = 'Opera';

  // OS detection
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'MacOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iOS')) os = 'iOS';

  return { browser, os };
};

export const useAnalyticsTracking = () => {
  const location = useLocation();
  const startTimeRef = useRef<number>(Date.now());
  const previousPathRef = useRef<string>('');

  useEffect(() => {
    const trackPageView = async () => {
      try {
        // Track previous page duration if exists
        if (previousPathRef.current) {
          const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
          
          await supabase.from('analytics_events').insert({
            session_id: getSessionId(),
            event_type: 'page_view',
            page_url: previousPathRef.current,
            page_title: document.title,
            referrer: document.referrer || null,
            user_agent: navigator.userAgent,
            device_type: getDeviceType(),
            duration_seconds: duration,
            ...getBrowserInfo()
          });
        }

        // Update refs for current page
        previousPathRef.current = location.pathname;
        startTimeRef.current = Date.now();

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();

        // Track new page view start
        await supabase.from('analytics_events').insert({
          session_id: getSessionId(),
          user_id: user?.id || null,
          event_type: 'page_view',
          page_url: location.pathname,
          page_title: document.title,
          referrer: document.referrer || null,
          user_agent: navigator.userAgent,
          device_type: getDeviceType(),
          ...getBrowserInfo()
        });
      } catch (error) {
        // Silently fail - don't disrupt user experience
        console.debug('Analytics tracking error:', error);
      }
    };

    trackPageView();

    // Track page unload
    const handleBeforeUnload = () => {
      if (previousPathRef.current) {
        const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
        
        // Use sendBeacon for reliable tracking on page unload
        const data = {
          session_id: getSessionId(),
          event_type: 'page_view',
          page_url: previousPathRef.current,
          page_title: document.title,
          duration_seconds: duration,
          device_type: getDeviceType(),
          ...getBrowserInfo()
        };

        // Note: This is a best-effort approach
        navigator.sendBeacon(
          `https://kqbetheonxiclwgyatnm.supabase.co/rest/v1/analytics_events`,
          JSON.stringify(data)
        );
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [location.pathname]);
};
