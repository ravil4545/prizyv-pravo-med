import SubscriptionStatusCard from "./SubscriptionStatusCard";

interface SubscriptionBannerProps {
  compact?: boolean;
}

export default function SubscriptionBanner({ compact = false }: SubscriptionBannerProps) {
  return <SubscriptionStatusCard compact={compact} />;
}
