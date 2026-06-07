export interface TeamInfo { color: string; abbr: string; logo?: string }

// ── ESPN CDN logo URL helpers ─────────────────────────────────────────────────
const nba = (c: string, a: string, s: string): TeamInfo => ({ color: c, abbr: a, logo: `https://a.espncdn.com/i/teamlogos/nba/500/${s}.png` });
const nfl = (c: string, a: string, s: string): TeamInfo => ({ color: c, abbr: a, logo: `https://a.espncdn.com/i/teamlogos/nfl/500/${s}.png` });
const mlb = (c: string, a: string, s: string): TeamInfo => ({ color: c, abbr: a, logo: `https://a.espncdn.com/i/teamlogos/mlb/500/${s}.png` });
const soc = (c: string, a: string):             TeamInfo => ({ color: c, abbr: a });

// ── Team map (keyed by lowercased full name AND common nickname) ───────────────
const TEAMS: Record<string, TeamInfo> = {
  // ── NBA ─────────────────────────────────────────────────────────────────────
  'atlanta hawks':          nba('#E03A3E', 'ATL', 'atl'),
  'hawks':                  nba('#E03A3E', 'ATL', 'atl'),
  'boston celtics':         nba('#007A33', 'BOS', 'bos'),
  'celtics':                nba('#007A33', 'BOS', 'bos'),
  'brooklyn nets':          nba('#000000', 'BKN', 'bkn'),
  'nets':                   nba('#000000', 'BKN', 'bkn'),
  'charlotte hornets':      nba('#1D1160', 'CHA', 'cha'),
  'hornets':                nba('#1D1160', 'CHA', 'cha'),
  'chicago bulls':          nba('#CE1141', 'CHI', 'chi'),
  'bulls':                  nba('#CE1141', 'CHI', 'chi'),
  'cleveland cavaliers':    nba('#860038', 'CLE', 'cle'),
  'cavaliers':              nba('#860038', 'CLE', 'cle'),
  'dallas mavericks':       nba('#00538C', 'DAL', 'dal'),
  'mavericks':              nba('#00538C', 'DAL', 'dal'),
  'denver nuggets':         nba('#0E2240', 'DEN', 'den'),
  'nuggets':                nba('#0E2240', 'DEN', 'den'),
  'detroit pistons':        nba('#C8102E', 'DET', 'det'),
  'pistons':                nba('#C8102E', 'DET', 'det'),
  'golden state warriors':  nba('#1D428A', 'GSW', 'gs'),
  'warriors':               nba('#1D428A', 'GSW', 'gs'),
  'houston rockets':        nba('#CE1141', 'HOU', 'hou'),
  'rockets':                nba('#CE1141', 'HOU', 'hou'),
  'indiana pacers':         nba('#002D62', 'IND', 'ind'),
  'pacers':                 nba('#002D62', 'IND', 'ind'),
  'los angeles clippers':   nba('#C8102E', 'LAC', 'lac'),
  'clippers':               nba('#C8102E', 'LAC', 'lac'),
  'los angeles lakers':     nba('#552583', 'LAL', 'lal'),
  'lakers':                 nba('#552583', 'LAL', 'lal'),
  'memphis grizzlies':      nba('#5D76A9', 'MEM', 'mem'),
  'grizzlies':              nba('#5D76A9', 'MEM', 'mem'),
  'miami heat':             nba('#98002E', 'MIA', 'mia'),
  'heat':                   nba('#98002E', 'MIA', 'mia'),
  'milwaukee bucks':        nba('#00471B', 'MIL', 'mil'),
  'bucks':                  nba('#00471B', 'MIL', 'mil'),
  'minnesota timberwolves': nba('#0C2340', 'MIN', 'min'),
  'timberwolves':           nba('#0C2340', 'MIN', 'min'),
  'new orleans pelicans':   nba('#0C2340', 'NOP', 'no'),
  'pelicans':               nba('#0C2340', 'NOP', 'no'),
  'new york knicks':        nba('#006BB6', 'NYK', 'ny'),
  'knicks':                 nba('#006BB6', 'NYK', 'ny'),
  'oklahoma city thunder':  nba('#007AC1', 'OKC', 'okc'),
  'thunder':                nba('#007AC1', 'OKC', 'okc'),
  'orlando magic':          nba('#0077C0', 'ORL', 'orl'),
  'magic':                  nba('#0077C0', 'ORL', 'orl'),
  'philadelphia 76ers':     nba('#006BB6', 'PHI', 'phi'),
  '76ers':                  nba('#006BB6', 'PHI', 'phi'),
  'phoenix suns':           nba('#1D1160', 'PHX', 'phx'),
  'suns':                   nba('#1D1160', 'PHX', 'phx'),
  'portland trail blazers': nba('#E03A3E', 'POR', 'por'),
  'trail blazers':          nba('#E03A3E', 'POR', 'por'),
  'blazers':                nba('#E03A3E', 'POR', 'por'),
  'sacramento kings':       nba('#5A2D81', 'SAC', 'sac'),
  'kings':                  nba('#5A2D81', 'SAC', 'sac'),
  'san antonio spurs':      nba('#8A8D8F', 'SAS', 'sa'),
  'spurs':                  nba('#8A8D8F', 'SAS', 'sa'),
  'toronto raptors':        nba('#CE1141', 'TOR', 'tor'),
  'raptors':                nba('#CE1141', 'TOR', 'tor'),
  'utah jazz':              nba('#002B5C', 'UTA', 'utah'),
  'jazz':                   nba('#002B5C', 'UTA', 'utah'),
  'washington wizards':     nba('#002B5C', 'WAS', 'wsh'),
  'wizards':                nba('#002B5C', 'WAS', 'wsh'),

  // ── NFL ─────────────────────────────────────────────────────────────────────
  'arizona cardinals':      nfl('#97233F', 'ARI', 'ari'),
  'cardinals':              nfl('#97233F', 'ARI', 'ari'),
  'atlanta falcons':        nfl('#A71930', 'ATL', 'atl'),
  'falcons':                nfl('#A71930', 'ATL', 'atl'),
  'baltimore ravens':       nfl('#241773', 'BAL', 'bal'),
  'ravens':                 nfl('#241773', 'BAL', 'bal'),
  'buffalo bills':          nfl('#00338D', 'BUF', 'buf'),
  'bills':                  nfl('#00338D', 'BUF', 'buf'),
  'carolina panthers':      nfl('#0085CA', 'CAR', 'car'),
  'panthers':               nfl('#0085CA', 'CAR', 'car'),
  'chicago bears':          nfl('#0B162A', 'CHI', 'chi'),
  'bears':                  nfl('#0B162A', 'CHI', 'chi'),
  'cincinnati bengals':     nfl('#FB4F14', 'CIN', 'cin'),
  'bengals':                nfl('#FB4F14', 'CIN', 'cin'),
  'cleveland browns':       nfl('#311D00', 'CLE', 'cle'),
  'browns':                 nfl('#311D00', 'CLE', 'cle'),
  'dallas cowboys':         nfl('#003594', 'DAL', 'dal'),
  'cowboys':                nfl('#003594', 'DAL', 'dal'),
  'denver broncos':         nfl('#FB4F14', 'DEN', 'den'),
  'broncos':                nfl('#FB4F14', 'DEN', 'den'),
  'detroit lions':          nfl('#0076B6', 'DET', 'det'),
  'lions':                  nfl('#0076B6', 'DET', 'det'),
  'green bay packers':      nfl('#203731', 'GB',  'gb'),
  'packers':                nfl('#203731', 'GB',  'gb'),
  'houston texans':         nfl('#03202F', 'HOU', 'hou'),
  'texans':                 nfl('#03202F', 'HOU', 'hou'),
  'indianapolis colts':     nfl('#002C5F', 'IND', 'ind'),
  'colts':                  nfl('#002C5F', 'IND', 'ind'),
  'jacksonville jaguars':   nfl('#006778', 'JAX', 'jax'),
  'jaguars':                nfl('#006778', 'JAX', 'jax'),
  'kansas city chiefs':     nfl('#E31837', 'KC',  'kc'),
  'chiefs':                 nfl('#E31837', 'KC',  'kc'),
  'las vegas raiders':      nfl('#A5ACAF', 'LV',  'lv'),
  'raiders':                nfl('#A5ACAF', 'LV',  'lv'),
  'los angeles chargers':   nfl('#0080C6', 'LAC', 'lac'),
  'chargers':               nfl('#0080C6', 'LAC', 'lac'),
  'los angeles rams':       nfl('#003594', 'LAR', 'lar'),
  'rams':                   nfl('#003594', 'LAR', 'lar'),
  'miami dolphins':         nfl('#008E97', 'MIA', 'mia'),
  'dolphins':               nfl('#008E97', 'MIA', 'mia'),
  'minnesota vikings':      nfl('#4F2683', 'MIN', 'min'),
  'vikings':                nfl('#4F2683', 'MIN', 'min'),
  'new england patriots':   nfl('#002244', 'NE',  'ne'),
  'patriots':               nfl('#002244', 'NE',  'ne'),
  'new orleans saints':     nfl('#D3BC8D', 'NO',  'no'),
  'saints':                 nfl('#D3BC8D', 'NO',  'no'),
  'new york giants':        nfl('#0B2265', 'NYG', 'nyg'),
  'giants':                 nfl('#0B2265', 'NYG', 'nyg'),
  'new york jets':          nfl('#125740', 'NYJ', 'nyj'),
  'jets':                   nfl('#125740', 'NYJ', 'nyj'),
  'philadelphia eagles':    nfl('#004C54', 'PHI', 'phi'),
  'eagles':                 nfl('#004C54', 'PHI', 'phi'),
  'pittsburgh steelers':    nfl('#FFB612', 'PIT', 'pit'),
  'steelers':               nfl('#FFB612', 'PIT', 'pit'),
  'san francisco 49ers':    nfl('#AA0000', 'SF',  'sf'),
  '49ers':                  nfl('#AA0000', 'SF',  'sf'),
  'seattle seahawks':       nfl('#002244', 'SEA', 'sea'),
  'seahawks':               nfl('#002244', 'SEA', 'sea'),
  'tampa bay buccaneers':   nfl('#D50A0A', 'TB',  'tb'),
  'buccaneers':             nfl('#D50A0A', 'TB',  'tb'),
  'tennessee titans':       nfl('#0C2340', 'TEN', 'ten'),
  'titans':                 nfl('#0C2340', 'TEN', 'ten'),
  'washington commanders':  nfl('#5A1414', 'WAS', 'wsh'),
  'commanders':             nfl('#5A1414', 'WAS', 'wsh'),

  // ── MLB ─────────────────────────────────────────────────────────────────────
  'new york yankees':       mlb('#003087', 'NYY', 'nyy'),
  'yankees':                mlb('#003087', 'NYY', 'nyy'),
  'boston red sox':         mlb('#BD3039', 'BOS', 'bos'),
  'red sox':                mlb('#BD3039', 'BOS', 'bos'),
  'los angeles dodgers':    mlb('#005A9C', 'LAD', 'lad'),
  'dodgers':                mlb('#005A9C', 'LAD', 'lad'),
  'chicago cubs':           mlb('#0E3386', 'CHC', 'chc'),
  'cubs':                   mlb('#0E3386', 'CHC', 'chc'),
  'chicago white sox':      mlb('#27251F', 'CWS', 'chw'),
  'white sox':              mlb('#27251F', 'CWS', 'chw'),
  'houston astros':         mlb('#002D62', 'HOU', 'hou'),
  'astros':                 mlb('#002D62', 'HOU', 'hou'),
  'san francisco giants':   mlb('#FD5A1E', 'SFG', 'sf'),
  'atlanta braves':         mlb('#CE1141', 'ATL', 'atl'),
  'braves':                 mlb('#CE1141', 'ATL', 'atl'),
  'new york mets':          mlb('#002D72', 'NYM', 'nym'),
  'mets':                   mlb('#002D72', 'NYM', 'nym'),
  'st. louis cardinals':    mlb('#C41E3A', 'STL', 'stl'),
  'philadelphia phillies':  mlb('#E81828', 'PHI', 'phi'),
  'phillies':               mlb('#E81828', 'PHI', 'phi'),
  'toronto blue jays':      mlb('#134A8E', 'TOR', 'tor'),
  'blue jays':              mlb('#134A8E', 'TOR', 'tor'),
  'seattle mariners':       mlb('#0C2C56', 'SEA', 'sea'),
  'mariners':               mlb('#0C2C56', 'SEA', 'sea'),
  'milwaukee brewers':      mlb('#12284B', 'MIL', 'mil'),
  'brewers':                mlb('#12284B', 'MIL', 'mil'),
  'colorado rockies':       mlb('#33006F', 'COL', 'col'),
  'rockies':                mlb('#33006F', 'COL', 'col'),
  'san diego padres':       mlb('#2F241D', 'SD',  'sd'),
  'padres':                 mlb('#2F241D', 'SD',  'sd'),
  'texas rangers':          mlb('#003278', 'TEX', 'tex'),
  'rangers':                mlb('#003278', 'TEX', 'tex'),
  'detroit tigers':         mlb('#0C2340', 'DET', 'det'),
  'tigers':                 mlb('#0C2340', 'DET', 'det'),
  'minnesota twins':        mlb('#002B5C', 'MIN', 'min'),
  'twins':                  mlb('#002B5C', 'MIN', 'min'),
  'kansas city royals':     mlb('#004687', 'KC',  'kc'),
  'royals':                 mlb('#004687', 'KC',  'kc'),
  'pittsburgh pirates':     mlb('#27251F', 'PIT', 'pit'),
  'pirates':                mlb('#27251F', 'PIT', 'pit'),
  'cincinnati reds':        mlb('#C6011F', 'CIN', 'cin'),
  'reds':                   mlb('#C6011F', 'CIN', 'cin'),
  'baltimore orioles':      mlb('#DF4601', 'BAL', 'bal'),
  'orioles':                mlb('#DF4601', 'BAL', 'bal'),
  'cleveland guardians':    mlb('#0C2340', 'CLE', 'cle'),
  'guardians':              mlb('#0C2340', 'CLE', 'cle'),
  'los angeles angels':     mlb('#003263', 'LAA', 'laa'),
  'angels':                 mlb('#003263', 'LAA', 'laa'),
  'washington nationals':   mlb('#AB0003', 'WSH', 'wsh'),
  'nationals':              mlb('#AB0003', 'WSH', 'wsh'),
  'tampa bay rays':         mlb('#092C5C', 'TB',  'tb'),
  'rays':                   mlb('#092C5C', 'TB',  'tb'),
  'miami marlins':          mlb('#00A3E0', 'MIA', 'mia'),
  'marlins':                mlb('#00A3E0', 'MIA', 'mia'),
  'arizona diamondbacks':   mlb('#A71930', 'ARI', 'ari'),
  'diamondbacks':           mlb('#A71930', 'ARI', 'ari'),
  'oakland athletics':      mlb('#003831', 'OAK', 'oak'),
  'athletics':              mlb('#003831', 'OAK', 'oak'),

  // ── Soccer ──────────────────────────────────────────────────────────────────
  'arsenal':                soc('#EF0107', 'ARS'),
  'chelsea':                soc('#034694', 'CHE'),
  'liverpool':              soc('#C8102E', 'LIV'),
  'manchester city':        soc('#6CABDD', 'MCI'),
  'man city':               soc('#6CABDD', 'MCI'),
  'manchester united':      soc('#DA020E', 'MUN'),
  'man united':             soc('#DA020E', 'MUN'),
  'tottenham hotspur':      soc('#132257', 'TOT'),
  'tottenham':              soc('#132257', 'TOT'),
  'fc barcelona':           soc('#A50044', 'BAR'),
  'barcelona':              soc('#A50044', 'BAR'),
  'real madrid':            soc('#FEBE10', 'RMA'),
  'atletico madrid':        soc('#CE3524', 'ATM'),
  'juventus':               soc('#000000', 'JUV'),
  'ac milan':               soc('#FB090B', 'ACM'),
  'inter milan':            soc('#010E80', 'INT'),
  'napoli':                 soc('#12A0C3', 'NAP'),
  'as roma':                soc('#8B1A1A', 'ROM'),
  'roma':                   soc('#8B1A1A', 'ROM'),
  'bayern munich':          soc('#DC052D', 'BAY'),
  'borussia dortmund':      soc('#FDE100', 'BVB'),
  'paris saint-germain':    soc('#004170', 'PSG'),
  'psg':                    soc('#004170', 'PSG'),
};

// ── Fallback ──────────────────────────────────────────────────────────────────

const PALETTE = ['#6366F1', '#8B5CF6', '#EC4899', '#EF4444', '#F97316', '#22C55E', '#14B8A6', '#3B82F6'];

function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function generateAbbr(name: string): string {
  const words = name.split(' ').filter((w) => w.length > 1);
  if (words.length === 0) return name.slice(0, 3).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  const last = words.slice(-2);
  return (last[0][0] + last[1].slice(0, 2)).toUpperCase();
}

// ── Public lookup ─────────────────────────────────────────────────────────────

export function getTeamInfo(teamName: string): TeamInfo {
  const key = teamName.toLowerCase().trim();

  // Exact match
  if (TEAMS[key]) return TEAMS[key];

  // Try progressively shorter suffixes ("Los Angeles Lakers" → "lakers")
  const words = key.split(' ');
  for (let i = 1; i < words.length; i++) {
    const suffix = words.slice(i).join(' ');
    if (TEAMS[suffix]) return TEAMS[suffix];
  }

  return { color: hashColor(teamName), abbr: generateAbbr(teamName) };
}
