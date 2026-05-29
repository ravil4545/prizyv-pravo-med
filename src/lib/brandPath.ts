export const withBrandPath = (pathname: string, target: string) => {
  const match = pathname.match(/^\/u\/([^/]+)/);
  if (!match) return target;
  const normalizedTarget = target.startsWith("/") ? target : `/${target}`;
  return `/u/${match[1]}${normalizedTarget}`;
};
