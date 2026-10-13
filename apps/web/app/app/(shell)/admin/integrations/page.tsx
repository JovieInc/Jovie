import { requireCurrentAdminPageAccess } from '@/lib/admin/page-access';
import { SettingsIntegrationsPage } from '../../settings/connectors/SettingsIntegrationsPage';
import SettingsLayout from '../../settings/layout';

export const runtime = 'nodejs';
export default async function OperatorIntegrationsPage() {
  await requireCurrentAdminPageAccess();
  return (
    <SettingsLayout>
      <SettingsIntegrationsPage route='/app/ov/integrations' />
    </SettingsLayout>
  );
}
