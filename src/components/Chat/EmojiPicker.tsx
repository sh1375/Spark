import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { ChatDialog } from './ChatDialog';

const RECENT_KEY = 'chat_recent_emojis';

const EMOJI_CATEGORIES = [
  {
    id: 'recent',
    label: 'اخیر',
    icon: '🕐',
    emojis: [] as string[],
  },
  {
    id: 'smileys',
    label: 'احساسات',
    icon: '😀',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
      '😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐',
      '🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒',
      '🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕',
      '😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱',
      '😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩',
      '🤡','👹','👺','👻','👽','👾','🤖',
    ],
  },
  {
    id: 'people',
    label: 'آدم‌ها',
    icon: '👤',
    emojis: [
      '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆',
      '👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅',
      '🤳','💪','🦾','🦵','🦶','👂','🦻','👃','👀','👁️','👅','🦷','🦴','👤','👥',
      '🧑','👱','👨','🧔','👩','🧓','👴','👵','🧒','👦','👧','👶','🧑‍💼','👨‍💼','👩‍💼',
      '🧑‍🔧','👨‍🔧','👩‍🔧','🧑‍🏫','👨‍🏫','👩‍🏫','🧑‍⚕️','👨‍⚕️','👩‍⚕️','🧑‍🍳','👨‍🍳','👩‍🍳',
      '🧑‍🎨','👨‍🎨','👩‍🎨','🧑‍🚀','👨‍🚀','👩‍🚀','🧑‍✈️','👨‍✈️','👩‍✈️','👮','💂','🕵️',
      '👷','🤴','👸','🧙','🧝','🧛','🧟','🧞','🧜','🧚','👼','🎅','🤶','🦸','🦹',
    ],
  },
  {
    id: 'nature',
    label: 'طبیعت',
    icon: '🌿',
    emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈',
      '🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱',
      '🐛','🦋','🐌','🐞','🐜','🦟','🦗','🦂','🐢','🐍','🦎','🦖','🦕','🐊','🐸','🦈',
      '🐬','🐋','🐳','🦭','🐟','🐠','🐡','🦑','🐙','🦐','🦞','🦀','🌸','🌺','🌻','🌹',
      '🌷','🌱','🌿','🍀','🍁','🍂','🍃','🌾','🌵','🌴','🌳','🌲','🎋','🎍','🍄','🌊',
      '🌈','☀️','🌤️','⛅','🌦️','🌧️','⛈️','🌩️','❄️','🌬️','💨','🌪️','🌫️','🌈','🌙','⭐',
    ],
  },
  {
    id: 'food',
    label: 'غذا',
    icon: '🍕',
    emojis: [
      '🍎','🍊','🍋','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🍆',
      '🌽','🥕','🧄','🧅','🥔','🍠','🥐','🥖','🫓','🥨','🧀','🍳','🥚','🍞','🥞','🧇',
      '🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫔','🌮','🌯','🥙','🧆','🥗','🥘','🫕',
      '🍲','🍛','🍜','🍝','🍠','🍱','🍘','🍙','🍚','🍛','🍣','🍤','🦐','🦞','🦀','🍦',
      '🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🫖','☕','🧋',
      '🥤','🍹','🍸','🍷','🍺','🍻','🥂','🥃','🫗','🥛','🍼','🫙','🧃','🥤','🧉','🍶',
    ],
  },
  {
    id: 'travel',
    label: 'سفر',
    icon: '✈️',
    emojis: [
      '🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵',
      '🛺','🚲','🛴','🛹','🛼','🚏','🛣️','🛤️','⛽','🚨','🚥','🚦','🚧','⚓','🛟','⛵',
      '🚤','🛥️','🛳️','⛴️','🚢','✈️','🛩️','🛫','🛬','🪂','💺','🚁','🚟','🚠','🚡','🛸',
      '🚀','🛰️','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏧','🏨','🏩','🏪','🏫','🏬','🏭',
      '🗼','🗽','⛪','🕌','🛕','🕍','⛩️','🕋','⛲','⛺','🏕️','🌁','🌃','🏙️','🌄','🌅',
      '🌆','🌇','🌉','🎠','🎡','🎢','🎪','🗺️','🗾','🌐','🗻','🏔️','⛰️','🌋','🏖️','🏝️',
    ],
  },
  {
    id: 'activities',
    label: 'ورزش',
    icon: '⚽',
    emojis: [
      '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🥊','🥋',
      '🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️','🤼','🤸','⛹️','🤺','🏇',
      '🧘','🏄','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖️','🎗️','🎫','🎟️','🎪',
      '🤹','🎭','🎬','🎨','🖼️','🎠','🎡','🎢','🎮','🕹️','🎲','♟️','🃏','🀄','🎯','🎳',
      '🎰','🎻','🎸','🎹','🥁','🎺','🎷','🪗','🎵','🎶','🎤','🎧','📻','🎙️','🎚️','🎛️',
    ],
  },
  {
    id: 'objects',
    label: 'اشیاء',
    icon: '💡',
    emojis: [
      '💡','🔦','🕯️','🪔','🧯','🛢️','💰','💵','💴','💶','💷','💸','💳','🪙','💹','📈',
      '📉','📊','💼','👜','👝','🎒','🧳','💍','💎','👓','🕶️','🥽','🌂','☂️','🧵','🪡',
      '📱','💻','⌨️','🖥️','🖨️','🖱️','💾','💿','📀','📷','📸','📹','🎥','📞','☎️','📟',
      '📠','📺','📻','🧭','⏱️','⏰','⌚','⏲️','🕰️','⌛','⏳','📡','🔋','🔌','💡','🔧',
      '🔨','⛏️','⚒️','🛠️','🔩','⚙️','🧲','🪜','🧱','⚗️','🔭','🔬','🩺','🩻','🩹','🩸',
      '💊','💉','🩼','🩴','🪛','🔑','🗝️','🔐','🔏','🔓','🔒','🚪','🪞','🪟','🛋️','🪑',
    ],
  },
  {
    id: 'symbols',
    label: 'نمادها',
    icon: '❤️',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖',
      '💘','💝','💟','☮️','✝️','☪️','🕉️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉',
      '♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','🈴','🈺','🈹','🈲','🉐',
      '✅','❎','🆗','🆙','🆒','🆕','🆓','🔝','🔛','🔜','🔚','⭕','❌','❓','❗','❕',
      '🔥','💥','🌊','🌀','⭐','🌟','💫','✨','🎆','🎇','🧨','🎉','🎊','🎋','🎍','🎎',
      '🎏','🎐','🧧','🎁','🎀','🎗️','🎟️','🏮','🪔','🧿','🗿','🗺️','🧭','🪬','🪩','🪅',
    ],
  },
];

interface Props {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: Props) {
  const [activeCategory, setActiveCategory] = useState(1);
  const [search, setSearch] = useState('');
  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(stored) ? stored.filter((emoji): emoji is string => typeof emoji === 'string').slice(0, 24) : [];
    } catch {
      return [];
    }
  });

  const handleSelect = (emoji: string) => {
    // Update recents
    const updated = [emoji, ...recentEmojis.filter(e => e !== emoji)].slice(0, 24);
    setRecentEmojis(updated);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
    onSelect(emoji);
  };

  const query = search.trim();
  const searchResults = query
    ? [...new Set(EMOJI_CATEGORIES.slice(1).flatMap(category =>
        category.label.includes(query) ? category.emojis : category.emojis.filter(emoji => emoji.includes(query)),
      ))]
    : null;
  const displayCategory = EMOJI_CATEGORIES[activeCategory];
  const displayEmojis = searchResults || (activeCategory === 0 ? recentEmojis : displayCategory.emojis);

  return (
    <ChatDialog label="انتخاب ایموجی" onClose={onClose}>
      <div className="flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex shrink-0 items-center justify-between px-4 pt-2 pb-1">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">انتخاب ایموجی</h3>
          <button type="button" autoFocus onClick={onClose} aria-label="بستن انتخاب ایموجی" className="grid size-10 place-items-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            <X className="size-4" />
          </button>
        </div>
        <div className="relative mx-4 mb-2 shrink-0">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            aria-label="جستجوی ایموجی یا دسته"
            placeholder="جستجوی ایموجی یا دسته…"
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pr-9 pl-3 text-base text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white sm:text-sm"
          />
        </div>
        {!query && (
          <div aria-label="دسته‌های ایموجی" className="grid shrink-0 grid-cols-5 gap-1 border-b border-slate-100 px-3 pb-2 min-[380px]:grid-cols-9 dark:border-slate-800">
            {EMOJI_CATEGORIES.map((category, index) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(index)}
                aria-label={category.label}
                aria-pressed={activeCategory === index}
                title={category.label}
                className={`h-9 rounded-lg text-base transition-colors ${activeCategory === index ? 'bg-teal-100 dark:bg-teal-900/60' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                {category.icon}
              </button>
            ))}
          </div>
        )}
        <div className="h-52 min-h-0 overflow-y-auto overscroll-contain px-3 pb-3">
          <p className="px-1 py-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            {query ? `${displayEmojis.length} نتیجه` : displayCategory.label}
          </p>
          {displayEmojis.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">
              {query ? 'نتیجه‌ای یافت نشد' : 'هنوز ایموجی‌ای استفاده نشده'}
            </p>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {displayEmojis.map((emoji, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleSelect(emoji)}
                  className="grid h-10 place-items-center rounded-lg text-xl transition-colors hover:bg-slate-100 active:bg-teal-100 dark:hover:bg-slate-800 dark:active:bg-teal-900"
                  style={{ fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </ChatDialog>
  );
}
