import { Header } from '@/components/layout/header';
import { DocsLayout } from '@/components/docs/docs-layout';
import { getNavigation } from '@/lib/docs';

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigation = getNavigation();

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header />
      <DocsLayout navigation={navigation}>{children}</DocsLayout>
    </div>
  );
}
