import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabaseConfig';
import { useAuth } from '@/contexts/AuthContext';

const getSessionId = (): string => {
  let sessionId = sessionStorage.getItem('analytics_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('analytics_session_id', sessionId);
  }
  return sessionId;
};

const getDeviceType = (): string => {
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
};

const getBrowserInfo = () => {
  const ua = navigator.userAgent;
  let browser = 'Unknown';
  let os = 'Unknown';

  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari')) browser = 'Safari';
  else if (ua.includes('Edge')) browser = 'Edge';
  else if (ua.includes('Opera')) browser = 'Opera';

  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'MacOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iOS')) os = 'iOS';

  return { browser, os };
};

export const useAnalyticsTracking = () => {
  const location = useLocation();
  const { user } = useAuth();
  const startTimeRef = useRef<number>(Date.now());
  const previousPathRef = useRef<string>('');

  // Debounce rapid navigation — only track if user stays on page > 300ms
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        if (previousPathRef.current) {
          const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
          supabase.from('analytics_events').insert({
            session_id: getSessionId(),
            event_type: 'page_view',
            page_url: previousPathRef.current,
            page_title: document.title,
            referrer: document.referrer || null,
            user_agent: navigator.userAgent,
            device_type: getDeviceType(),
            duration_seconds: duration,
            ...getBrowserInfo(),
          }).then(() => {}, () => {}); // .then() обязателен: ленивый билдер supabase-js v2
        }

        previousPathRef.current = location.pathname;
        startTimeRef.current = Date.now();

        supabase.from('analytics_events').insert({
          session_id: getSessionId(),
          user_id: user?.id ?? null,
          event_type: 'page_view',
          page_url: location.pathname,
          page_title: document.title,
          referrer: document.referrer || null,
          user_agent: navigator.userAgent,
          device_type: getDeviceType(),
          ...getBrowserInfo(),
        }).then(() => {}, () => {}); // .then() обязателен: ленивый билдер supabase-js v2
      } catch (error) {
        console.debug('Analytics tracking error:', error);
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [location.pathname, user?.id]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!previousPathRef.current) return;
      const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const payload = JSON.stringify({
        session_id: getSessionId(),
        event_type: 'page_view',
        page_url: previousPathRef.current,
        page_title: document.title,
        duration_seconds: duration,
        device_type: getDeviceType(),
        ...getBrowserInfo(),
      });
      // sendBeacon не умеет ставить заголовки, поэтому раньше запрос уходил БЕЗ
      // apikey → PostgREST отвечал 401 и событие выгрузки терялось. apikey
      // передаём query-параметром (anon-ключ публичный), Content-Type —
      // через тип Blob (без него PostgREST не примет JSON-тело).
      navigator.sendBeacon(
        `${SUPABASE_URL}/rest/v1/analytics_events?apikey=${SUPABASE_ANON_KEY}`,
        new Blob([payload], { type: 'application/json' }),
      );
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);
};
