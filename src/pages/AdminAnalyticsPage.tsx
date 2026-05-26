import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { ArrowLeft, Users, Eye, Clock, MousePointer, TrendingDown, Activity, ShieldAlert } from 'lucide-react';
import { format, startOfWeek, differenceInDays } from 'date-fns';
import { ru } from 'date-fns/locale';

interface AnalyticsEvent {
  id: string;
  session_id: string;
  user_id: string | null;
  event_type: string;
  page_url: string;
  page_title: string | null;
  referrer: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  duration_seconds: number | null;
  created_at: string;
}

interface PageStats {
  page_url: string;
  visits: number;
  avg_duration: number;
}

interface DeviceStats {
  device_type: string;
  count: number;
}

interface CohortRow {
  weekStart: string;
  weekLabel: string;
  total: number;
  d1: number;
  d7: number;
  d30: number;
  weekAgeDays: number;
}

interface FunnelStep {
  name: string;
  count: number;
  pctFromFirst: number;
  pctFromPrev: number;
}

interface AdminEvent {
  id: string;
  user_id: string | null;
  user_email: string | null;
  page_url: string;
  created_at: string;
  browser: string | null;
  device_type: string | null;
}

const AdminAnalyticsPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [pageStats, setPageStats] = useState<PageStats[]>([]);
  const [deviceStats, setDeviceStats] = useState<DeviceStats[]>([]);
  const [dailyStats, setDailyStats] = useState<any[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [totalPageViews, setTotalPageViews] = useState(0);
  const [avgDuration, setAvgDuration] = useState(0);

  // Cohorts / funnel / audit
  const [cohorts, setCohorts] = useState<CohortRow[]>([]);
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [adminEvents, setAdminEvents] = useState<AdminEvent[]>([]);

  useEffect(() => {
    checkAdminAndLoadData();
  }, []);

  const checkAdminAndLoadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate('/auth');
        return;
      }

      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      const isAdmin = roles?.some(r => r.role === 'admin');

      if (!isAdmin) {
        navigate('/dashboard');
        return;
      }

      await Promise.all([loadAnalytics(), loadAdvanced()]);
    } catch (error) {
      console.error('Error checking admin status:', error);
      navigate('/dashboard');
    }
  };

  const loadAdvanced = async () => {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - 90);
    const sinceIso = sinceDate.toISOString();
    const now = new Date();

    const [{ data: profiles }, { data: subs }, { data: docs }, { data: aEvents }, { data: adminRoles }] = await Promise.all([
      supabase.from('profiles').select('id, created_at, full_name').gte('created_at', sinceIso),
      supabase.from('user_subscriptions').select('user_id, is_paid, paid_until, created_at'),
      supabase.from('medical_documents_v2').select('user_id, uploaded_at, is_classified').gte('uploaded_at', sinceIso),
      supabase.from('analytics_events').select('user_id, session_id, page_url, created_at, browser, device_type, id').gte('created_at', sinceIso).order('created_at', { ascending: false }).limit(5000),
      supabase.from('user_roles').select('user_id').eq('role', 'admin'),
    ]);

    const lastActivityByUser: Record<string, string> = {};
    (aEvents || []).forEach((e: any) => {
      if (!e.user_id) return;
      if (!lastActivityByUser[e.user_id] || lastActivityByUser[e.user_id] < e.created_at) {
        lastActivityByUser[e.user_id] = e.created_at;
      }
    });

    // ── Cohorts: weekly registration buckets + retention ──────────────
    const cohortMap = new Map<string, { users: { id: string; created: Date }[] }>();
    (profiles || []).forEach((p: any) => {
      if (!p.created_at) return;
      const created = new Date(p.created_at);
      const weekStart = startOfWeek(created, { weekStartsOn: 1 });
      const key = format(weekStart, 'yyyy-MM-dd');
      if (!cohortMap.has(key)) cohortMap.set(key, { users: [] });
      cohortMap.get(key)!.users.push({ id: p.id, created });
    });

    const rows: CohortRow[] = [];
    cohortMap.forEach(({ users }, weekStart) => {
      const weekDate = new Date(weekStart);
      const weekAgeDays = differenceInDays(now, weekDate);
      const total = users.length;
      let d1 = 0, d7 = 0, d30 = 0;
      users.forEach((u) => {
        const last = lastActivityByUser[u.id];
        if (!last) return;
        const lastDate = new Date(last);
        const daysActive = differenceInDays(lastDate, u.created);
        if (daysActive >= 1) d1++;
        if (daysActive >= 7) d7++;
        if (daysActive >= 30) d30++;
      });
      rows.push({
        weekStart,
        weekLabel: format(weekDate, 'd MMM', { locale: ru }),
        total, d1, d7, d30, weekAgeDays,
      });
    });
    rows.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    setCohorts(rows);

    // ── Funnel ───────────────────────────────────────────────────────
    const visitorSessions = new Set<string>();
    (aEvents || []).forEach((e: any) => visitorSessions.add(e.session_id));
    const visitors = visitorSessions.size;
    const registered = (profiles || []).length;
    const uploaders = new Set<string>();
    const analyzed = new Set<string>();
    (docs || []).forEach((d: any) => {
      uploaders.add(d.user_id);
      if (d.is_classified) analyzed.add(d.user_id);
    });
    const subscribers = (subs || []).filter((s: any) => s.is_paid && (!s.paid_until || new Date(s.paid_until) > now)).length;

    const stepValues = [
      { name: 'Посетители', count: visitors },
      { name: 'Регистрация', count: registered },
      { name: 'Загрузил документ', count: uploaders.size },
      { name: 'AI-анализ', count: analyzed.size },
      { name: 'Подписка', count: subscribers },
    ];
    const first = stepValues[0].count || 1;
    const steps: FunnelStep[] = stepValues.map((s, i) => ({
      name: s.name,
      count: s.count,
      pctFromFirst: Math.round((s.count / first) * 100),
      pctFromPrev: i === 0 ? 100 : Math.round((s.count / Math.max(1, stepValues[i - 1].count)) * 100),
    }));
    setFunnel(steps);

    // ── Admin audit (events with /admin/ path from admin users) ─────
    const adminIds = new Set((adminRoles || []).map((r: any) => r.user_id));
    const profileMap = new Map<string, string>();
    (profiles || []).forEach((p: any) => { if (p.full_name) profileMap.set(p.id, p.full_name); });
    const audit: AdminEvent[] = (aEvents || [])
      .filter((e: any) => e.page_url?.startsWith('/admin') && (e.user_id ? adminIds.has(e.user_id) : false))
      .slice(0, 200)
      .map((e: any) => ({
        id: e.id,
        user_id: e.user_id,
        user_email: e.user_id ? (profileMap.get(e.user_id) || e.user_id.substring(0, 8)) : null,
        page_url: e.page_url,
        created_at: e.created_at,
        browser: e.browser,
        device_type: e.device_type,
      }));
    setAdminEvents(audit);
  };

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      // Load recent events
      const { data: eventsData } = await supabase
        .from('analytics_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (eventsData) {
        setEvents(eventsData);

        // Calculate page stats
        const pageMap = new Map<string, { visits: number; totalDuration: number; count: number }>();
        eventsData.forEach(event => {
          if (event.event_type === 'page_view') {
            const existing = pageMap.get(event.page_url) || { visits: 0, totalDuration: 0, count: 0 };
            existing.visits += 1;
            if (event.duration_seconds) {
              existing.totalDuration += event.duration_seconds;
              existing.count += 1;
            }
            pageMap.set(event.page_url, existing);
          }
        });

        const pages: PageStats[] = Array.from(pageMap.entries()).map(([url, stats]) => ({
          page_url: url,
          visits: stats.visits,
          avg_duration: stats.count > 0 ? Math.round(stats.totalDuration / stats.count) : 0
        })).sort((a, b) => b.visits - a.visits);

        setPageStats(pages);

        // Calculate device stats
        const deviceMap = new Map<string, number>();
        eventsData.forEach(event => {
          if (event.device_type) {
            deviceMap.set(event.device_type, (deviceMap.get(event.device_type) || 0) + 1);
          }
        });

        const devices: DeviceStats[] = Array.from(deviceMap.entries()).map(([type, count]) => ({
          device_type: type,
          count
        }));

        setDeviceStats(devices);

        // Calculate daily stats
        const dailyMap = new Map<string, { sessions: Set<string>; pageViews: number; totalDuration: number; durationCount: number }>();
        eventsData.forEach(event => {
          const date = format(new Date(event.created_at), 'yyyy-MM-dd');
          const existing = dailyMap.get(date) || { sessions: new Set(), pageViews: 0, totalDuration: 0, durationCount: 0 };
          existing.sessions.add(event.session_id);
          if (event.event_type === 'page_view') {
            existing.pageViews += 1;
          }
          if (event.duration_seconds) {
            existing.totalDuration += event.duration_seconds;
            existing.durationCount += 1;
          }
          dailyMap.set(date, existing);
        });

        const daily = Array.from(dailyMap.entries()).map(([date, stats]) => ({
          date,
          sessions: stats.sessions.size,
          pageViews: stats.pageViews,
          avgDuration: stats.durationCount > 0 ? Math.round(stats.totalDuration / stats.durationCount) : 0
        })).sort((a, b) => a.date.localeCompare(b.date)).slice(-7);

        setDailyStats(daily);

        // Calculate totals
        const uniqueSessions = new Set(eventsData.map(e => e.session_id));
        setTotalSessions(uniqueSessions.size);
        
        const pageViews = eventsData.filter(e => e.event_type === 'page_view');
        setTotalPageViews(pageViews.length);

        const durationsSum = eventsData
          .filter(e => e.duration_seconds !== null)
          .reduce((sum, e) => sum + (e.duration_seconds || 0), 0);
        const durationsCount = eventsData.filter(e => e.duration_seconds !== null).length;
        setAvgDuration(durationsCount > 0 ? Math.round(durationsSum / durationsCount) : 0);
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))'];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Загрузка аналитики...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад
          </Button>
          <h1 className="text-3xl font-bold">Аналитика сайта</h1>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Всего сессий</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalSessions}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Просмотров страниц</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalPageViews}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Среднее время</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgDuration}с</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Популярная страница</CardTitle>
              <MousePointer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-sm font-bold truncate">{pageStats[0]?.page_url || 'N/A'}</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="overview">Обзор</TabsTrigger>
            <TabsTrigger value="funnel">Воронка</TabsTrigger>
            <TabsTrigger value="cohorts">Когорты</TabsTrigger>
            <TabsTrigger value="pages">Страницы</TabsTrigger>
            <TabsTrigger value="devices">Устройства</TabsTrigger>
            <TabsTrigger value="events">События</TabsTrigger>
            <TabsTrigger value="audit">Аудит</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Активность за последние 7 дней</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    sessions: { label: 'Сессии', color: 'hsl(var(--chart-1))' },
                    pageViews: { label: 'Просмотры', color: 'hsl(var(--chart-2))' }
                  }}
                  className="h-[300px]"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyStats}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Legend />
                      <Line type="monotone" dataKey="sessions" stroke="hsl(var(--chart-1))" name="Сессии" />
                      <Line type="monotone" dataKey="pageViews" stroke="hsl(var(--chart-2))" name="Просмотры" />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pages" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Статистика по страницам</CardTitle>
                <CardDescription>Просмотры и среднее время на странице</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead className="text-right">Посещений</TableHead>
                      <TableHead className="text-right">Среднее время (сек)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageStats.map((page) => (
                      <TableRow key={page.page_url}>
                        <TableCell className="font-medium">{page.page_url}</TableCell>
                        <TableCell className="text-right">{page.visits}</TableCell>
                        <TableCell className="text-right">{page.avg_duration}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="devices" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Распределение по устройствам</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    mobile: { label: 'Мобильные', color: 'hsl(var(--chart-1))' },
                    tablet: { label: 'Планшеты', color: 'hsl(var(--chart-2))' },
                    desktop: { label: 'Десктоп', color: 'hsl(var(--chart-3))' }
                  }}
                  className="h-[300px]"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={deviceStats}
                        dataKey="count"
                        nameKey="device_type"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label
                      >
                        {deviceStats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="funnel" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-primary" />
                  Воронка конверсии (90 дней)
                </CardTitle>
                <CardDescription>
                  От посетителей до оплативших подписку. % from prev — конверсия от предыдущего шага.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {funnel.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Нет данных за период</p>
                ) : (
                  <div className="space-y-3">
                    {funnel.map((step, i) => (
                      <div key={step.name}>
                        <div className="flex items-center justify-between mb-1 text-sm">
                          <span className="font-medium">
                            <span className="text-muted-foreground mr-2">{i + 1}.</span>
                            {step.name}
                          </span>
                          <span className="flex items-center gap-3 font-mono">
                            <span className="font-semibold">{step.count}</span>
                            <span className="text-xs text-muted-foreground w-20 text-right">
                              {i > 0 && `→ ${step.pctFromPrev}%`}
                            </span>
                            <span className="text-xs text-muted-foreground w-16 text-right">
                              {step.pctFromFirst}% от 1
                            </span>
                          </span>
                        </div>
                        <div className="h-8 bg-muted rounded relative overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all flex items-center px-2"
                            style={{ width: `${Math.max(step.pctFromFirst, 2)}%` }}
                          >
                            <span className="text-xs text-primary-foreground font-mono whitespace-nowrap">
                              {step.count}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cohorts" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Когорты регистраций (последние 90 дней)
                </CardTitle>
                <CardDescription>
                  Retention: % зарегистрированных, которые проявили активность через 1/7/30 дней. «—» — когорта моложе периода.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {cohorts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Нет регистраций за период</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Неделя</TableHead>
                          <TableHead className="text-right">Регистраций</TableHead>
                          <TableHead className="text-right">D1</TableHead>
                          <TableHead className="text-right">D7</TableHead>
                          <TableHead className="text-right">D30</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cohorts.map((c) => {
                          const fmt = (n: number, threshold: number) => {
                            if (c.weekAgeDays < threshold) return <span className="text-muted-foreground">—</span>;
                            const pct = c.total > 0 ? Math.round((n / c.total) * 100) : 0;
                            return (
                              <span>
                                <span className="font-semibold">{n}</span>
                                <span className="text-xs text-muted-foreground ml-1">({pct}%)</span>
                              </span>
                            );
                          };
                          return (
                            <TableRow key={c.weekStart}>
                              <TableCell className="font-mono text-xs">{c.weekLabel}</TableCell>
                              <TableCell className="text-right font-semibold">{c.total}</TableCell>
                              <TableCell className="text-right">{fmt(c.d1, 1)}</TableCell>
                              <TableCell className="text-right">{fmt(c.d7, 7)}</TableCell>
                              <TableCell className="text-right">{fmt(c.d30, 30)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="events" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Последние события</CardTitle>
                <CardDescription>100 последних событий аналитики</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[600px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Время</TableHead>
                        <TableHead>Тип</TableHead>
                        <TableHead>URL</TableHead>
                        <TableHead>Устройство</TableHead>
                        <TableHead>Браузер</TableHead>
                        <TableHead className="text-right">Время (сек)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.slice(0, 50).map((event) => (
                        <TableRow key={event.id}>
                          <TableCell className="text-xs">
                            {format(new Date(event.created_at), 'dd.MM HH:mm')}
                          </TableCell>
                          <TableCell className="text-xs">{event.event_type}</TableCell>
                          <TableCell className="text-xs">{event.page_url}</TableCell>
                          <TableCell className="text-xs">{event.device_type || '-'}</TableCell>
                          <TableCell className="text-xs">{event.browser || '-'}</TableCell>
                          <TableCell className="text-xs text-right">
                            {event.duration_seconds || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-primary" />
                  Аудит админских заходов
                </CardTitle>
                <CardDescription>
                  Посещения /admin/* админами за последние 90 дней (до 200 событий).
                </CardDescription>
              </CardHeader>
              <CardContent>
                {adminEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Нет административных событий</p>
                ) : (
                  <div className="max-h-[600px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Время</TableHead>
                          <TableHead>Админ</TableHead>
                          <TableHead>Раздел</TableHead>
                          <TableHead>Браузер</TableHead>
                          <TableHead>Устройство</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {adminEvents.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="text-xs font-mono">
                              {format(new Date(e.created_at), 'dd.MM HH:mm:ss')}
                            </TableCell>
                            <TableCell className="text-xs">{e.user_email || '—'}</TableCell>
                            <TableCell className="text-xs font-mono">{e.page_url}</TableCell>
                            <TableCell className="text-xs">{e.browser || '—'}</TableCell>
                            <TableCell className="text-xs">{e.device_type || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminAnalyticsPage;
