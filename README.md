# 🎲 Board Game Picker

A beautiful web application that helps you discover your next board game adventure by randomly selecting from your BoardGameGeek collection with advanced filtering options.

[![Board Game Picker Live](https://img.shields.io/badge/🎲_Try_It_Live-brightgreen?style=for-the-badge)](https://sl4ppy.github.io/BoardGameSelector/)
![Status](https://img.shields.io/badge/Status-Live-brightgreen)

## ✨ Features

- 🔄 **Collection Sync**: Automatically fetch and cache your BGG collection
- 🎯 **Smart Filtering**: Filter by player count, play time, complexity, and ownership status
- 🎲 **Random Selection**: Roll the dice to get a random game recommendation
- 🖼️ **Beautiful Display**: View game details with cover art and key information
- 💾 **Local Caching**: Reduces API calls with 24-hour cache system
- 📱 **Responsive Design**: Works perfectly on desktop and mobile devices
- ⚡ **Fast Performance**: Pure HTML/CSS/JavaScript - no build process required

## 🚀 Live Demo

**🌟 [Try the Board Game Picker Live!](https://sl4ppy.github.io/BoardGameSelector/) 🌟**

Visit the live application: https://sl4ppy.github.io/BoardGameSelector/

## 📋 How to Use

1. **Enter Your BGG Username**: Input your BoardGameGeek username in the text field
2. **Sync Collection**: Click "Sync Collection" to fetch your games (cached for 24 hours)
3. **Apply Filters**: Use the filter options to narrow down your game selection:
   - Player Count (1-5+ players)
   - Play Time (Quick, Medium, Long, Epic)
   - Complexity (Light to Very Heavy)
   - Game Type (Owned vs Wishlist)
4. **Roll the Dice**: Click the dice button to get a random game recommendation
5. **Explore**: View game details and click "View on BGG" for more information

## 🛠️ Installation & Deployment on GitHub Pages

### 🌟 **Branching Strategy**
This project uses a **dual-branch workflow** for safe development:
- **`main`** - Production branch (live site)
- **`dev`** - Development branch (for making changes)

📖 **See [WORKFLOW.md](WORKFLOW.md) for detailed development guidelines**

### Option 1: Fork this Repository

1. Fork this repository to your GitHub account
2. Go to your forked repository's Settings
3. Scroll down to "Pages" section
4. Under "Source", select "Deploy from a branch"
5. Choose "main" branch and "/ (root)" folder
6. Click "Save"
7. Your site will be available at `https://yourusername.github.io/BoardGameSelector`

### Option 2: Create New Repository

1. Create a new repository on GitHub
2. Clone it locally:
   ```bash
   git clone https://github.com/yourusername/your-repo-name.git
   cd your-repo-name
   ```
3. Copy all files from this project to your repository
4. Commit and push:
   ```bash
   git add .
   git commit -m "Initial commit: Board Game Picker"
   git push origin main
   ```
5. Enable GitHub Pages in repository settings (same as Option 1, steps 2-7)

### Option 3: Local Development

1. Clone or download this repository
2. Open `index.html` in your web browser
3. The application will work locally without any server setup

## 🏗️ Project Structure

```
BoardGameSelector/
├── index.html          # Main HTML structure
├── style.css           # Modern CSS styling
├── script.js           # Core JavaScript functionality
└── README.md           # Documentation
```

## 🔧 Technical Details

### BGG API Integration
- Uses BoardGameGeek XML API v2
- CORS proxy for cross-origin requests
- Fetches collection with stats and game details
- Excludes expansions by default

### Caching Strategy
- localStorage for client-side caching
- 24-hour cache expiration
- Reduces API load and improves performance
- Debug functions available (`window.debugBGP`)

### Filtering Logic
- Player count: Supports exact matches and 5+ players
- Play time: Categorized ranges (0-30, 30-60, 60-120, 120+ minutes)
- Complexity: BGG weight scale (1-5)
- Game type: Owned vs wishlist items

## 🎨 Customization

### Colors & Styling
Edit `style.css` to customize:
- Color scheme (CSS custom properties at top of file)
- Typography (Inter font family)
- Layout and spacing
- Animation timings

### Filters & Categories
Modify `script.js` to add new filters:
- Add new filter HTML in `index.html`
- Extend `applyFilters()` method
- Update filter options as needed

## 🐛 Troubleshooting

### Common Issues

**"No games found" error:**
- Verify BGG username is correct
- Ensure your collection is public on BGG
- Try clearing cache: `window.debugBGP.clearCache()`

**Images not loading:**
- BGG images may have CORS restrictions
- Fallback placeholder images are provided
- Some games may not have high-quality images

**API rate limiting:**
- BGG API has rate limits
- Cache reduces repeated requests
- Wait a few minutes if you hit limits

### Debug Functions

Open browser console and use:
```javascript
// Clear cached data
window.debugBGP.clearCache()

// View cached data
window.debugBGP.getCache()
```

## 🤝 Contributing

This project follows a **dual-branch workflow** for safe development:

### **Quick Start for Contributors**
```bash
# Clone and setup
git clone https://github.com/sl4ppy/BoardGameSelector.git
cd BoardGameSelector
git checkout dev

# Make changes on dev branch
git add .
git commit -m "Add: your feature description"
git push origin dev
```

### **Full Workflow**
1. **Development**: Work on the `dev` branch
2. **Testing**: Test thoroughly before deploying
3. **Production**: Merge `dev` → `main` for live deployment
4. **Deployment**: `main` branch automatically deploys to GitHub Pages

📋 **See [WORKFLOW.md](WORKFLOW.md) for complete development guidelines**

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- Data provided by [BoardGameGeek](https://boardgamegeek.com)
- CORS proxy by [AllOrigins](https://allorigins.win)
- Icons and fonts from Google Fonts
- Inspiration from the board gaming community

## 📊 Roadmap

- [ ] Advanced filtering (mechanics, categories, designers)
- [ ] Collection statistics and insights  
- [ ] Game recommendation algorithm
- [ ] Social features (sharing picks)
- [ ] PWA support for offline usage
- [ ] Dark mode theme
- [ ] Multiple user collections

---

**Happy Gaming!** 🎯 Roll the dice and discover your next favorite board game! 