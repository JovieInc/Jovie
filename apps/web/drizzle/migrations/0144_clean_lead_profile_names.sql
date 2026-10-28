-- JOV-7856: repair lead-built public profiles that copied the raw Linktree
-- page title into creator_profiles.display_name. The leads row retains the
-- raw scrape provenance. Only an unlocked profile whose current name
-- still exactly matches that raw title is eligible, so a user edit wins.
WITH lead_profile_name_repairs AS (
	SELECT DISTINCT ON (cp.id)
		cp.id,
		btrim(
			regexp_replace(
				regexp_replace(
					regexp_replace(
						l.display_name,
						'[[:space:]]+[-|–—][[:space:]]+(listen on|official|instagram|tour dates).*$',
						'',
						'i'
					),
					'[[:space:]]+[|][[:space:]]+.*$',
					''
				),
				'^@+',
				''
			)
		) AS clean_display_name
	FROM creator_profiles cp
	INNER JOIN leads l ON l.creator_profile_id = cp.id
	WHERE cp.display_name_locked = false
		AND cp.display_name = l.display_name
		AND (
			l.display_name ~ '[[:space:]]+[|][[:space:]]+'
			OR l.display_name ~* '[[:space:]]+[-–—][[:space:]]+(listen on|official|instagram|tour dates)'
		)
	ORDER BY cp.id, l.created_at DESC, l.id DESC
)
UPDATE creator_profiles cp
SET
	display_name = repair.clean_display_name,
	profile_edit_version = cp.profile_edit_version + 1,
	updated_at = now()
FROM lead_profile_name_repairs repair
WHERE cp.id = repair.id
	AND repair.clean_display_name <> ''
	AND cp.display_name <> repair.clean_display_name;
