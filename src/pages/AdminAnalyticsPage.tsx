import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { ArrowLeft, Users, Eye, Clock, MousePointer } from 'lucide-react';
import { format } from 'date-fns';

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

      await loadAnalytics();
    } catch (error) {
      console.error('Error checking admin status:', error);
      navigate('/dashboard');
    }
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
          <TabsList>
            <TabsTrigger value="overview">Обзор</TabsTrigger>
            <TabsTrigger value="pages">Страницы</TabsTrigger>
            <TabsTrigger value="devices">Устройства</TabsTrigger>
            <TabsTrigger value="events">События</TabsTrigger>
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
        </Tabs>
      </div>
    </div>
  );
};

export default AdminAnalyticsPage;
