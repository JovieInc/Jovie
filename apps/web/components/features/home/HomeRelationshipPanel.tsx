const RELATIONSHIP_DATA = [
  {
    name: 'Leah Chen',
    action: 'Tipped $10',
    when: '2h ago',
    type: 'tipper' as const,
  },
  {
    name: 'Marcus Vale',
    action: 'Listened on Spotify',
    when: '5h ago',
    type: 'listener' as const,
  },
  {
    name: 'Jules Porter',
    action: 'Show alert',
    when: 'Yesterday',
    type: 'show' as const,
  },
  {
    name: 'Ava Ruiz',
    action: 'Presave',
    when: 'Yesterday',
    type: 'presave' as const,
  },
] as const;

export function HomeRelationshipPanel() {
  return (
    <div className='homepage-relationship-panel' aria-hidden='true'>
      {RELATIONSHIP_DATA.map(fan => (
        <div key={fan.name} className='homepage-relationship-row'>
          <div className='homepage-relationship-info'>
            <span className='homepage-relationship-name'>{fan.name}</span>
            <span className='homepage-relationship-action'>{fan.action}</span>
          </div>
          <span className='homepage-relationship-when'>{fan.when}</span>
        </div>
      ))}
    </div>
  );
}
