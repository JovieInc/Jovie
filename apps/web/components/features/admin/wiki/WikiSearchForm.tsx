interface Props { initialQuery?: string }

export function WikiSearchForm({ initialQuery }: Props) {
  return (
    <form action="/hud/wiki" method="GET" className="mb-6">
      <input
        type="search"
        name="q"
        defaultValue={initialQuery || ''}
        placeholder="Search wiki..."
        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
      />
    </form>
  );
}
