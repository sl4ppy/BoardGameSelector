# 🔄 Git Workflow & Development Process

This document outlines the branching strategy and development workflow for the Board Game Picker project.

## 📋 Branch Strategy

### **Main Branch (`main`)**
- **Purpose**: Production-ready code that's live on GitHub Pages
- **Deployment**: Automatically deployed to `https://sl4ppy.github.io/BoardGameSelector`
- **Protection**: Only receives code through pull requests from `dev`
- **Stability**: Always contains tested, stable code

### **Development Branch (`dev`)**
- **Purpose**: Integration branch for new features and bug fixes
- **Testing**: Where features are tested before going to production
- **Collaboration**: Main branch for development work
- **Flexibility**: Can contain experimental features and work-in-progress

## 🔧 Development Workflow

### **1. Setup Your Local Environment**
```bash
# Clone the repository
git clone https://github.com/sl4ppy/BoardGameSelector.git
cd BoardGameSelector

# Check available branches
git branch -a

# Switch to development branch
git checkout dev
```

### **2. Making Changes**
```bash
# Always start from the latest dev branch
git checkout dev
git pull origin dev

# Create a feature branch (optional but recommended)
git checkout -b feature/your-feature-name

# Make your changes
# Edit files, test locally

# Stage and commit changes
git add .
git commit -m "Add: descriptive commit message"
```

### **3. Testing Your Changes**
```bash
# Test locally by opening index.html in your browser
# Or use a local server:
python -m http.server 8000
# or
npx serve .
```

### **4. Submitting Changes**

#### **Option A: Direct to Dev (Small Changes)**
```bash
# Switch to dev branch
git checkout dev

# Make your changes and commit
git add .
git commit -m "Fix: small bug or update"

# Push to dev
git push origin dev
```

#### **Option B: Feature Branch (Recommended for Larger Changes)**
```bash
# Push your feature branch
git push origin feature/your-feature-name

# Create pull request from feature branch to dev
# (do this on GitHub web interface)
```

### **5. Deploying to Production**
```bash
# Switch to main branch
git checkout main

# Merge dev into main (after testing)
git merge dev

# Push to main (triggers GitHub Pages deployment)
git push origin main

# Switch back to dev for continued development
git checkout dev
```

## 🚀 Release Process

### **Pre-Release Checklist**
- [ ] All features tested in `dev` branch
- [ ] No console errors or warnings
- [ ] Mobile responsiveness verified
- [ ] BGG API integration working
- [ ] Caching functionality tested
- [ ] All filters working correctly
- [ ] Game display working with various game types

### **Release Steps**
1. **Final Testing**: Thoroughly test all features in `dev`
2. **Update Version**: Update any version numbers or changelog
3. **Merge to Main**: Merge `dev` into `main`
4. **Deploy**: Push `main` to trigger GitHub Pages deployment
5. **Tag Release**: Create a git tag for the release
6. **Verify**: Test the live site after deployment

```bash
# Example release commands
git checkout main
git merge dev
git push origin main

# Create a release tag
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

## 🛡️ Branch Protection Best Practices

### **Main Branch Protection**
- Never commit directly to `main` in production
- Always merge from `dev` through pull requests
- Require status checks before merging
- Delete feature branches after merging

### **Development Guidelines**
- Keep commits atomic and descriptive
- Test changes locally before pushing
- Use meaningful commit messages
- Keep the `dev` branch stable and deployable

## 📝 Commit Message Guidelines

### **Format**
```
Type: Brief description

Optional longer description
```

### **Types**
- **Add**: New features or functionality
- **Fix**: Bug fixes
- **Update**: Changes to existing features
- **Remove**: Removing code or features
- **Refactor**: Code improvements without functional changes
- **Style**: CSS/UI changes
- **Docs**: Documentation updates
- **Test**: Adding or updating tests

### **Examples**
```bash
git commit -m "Add: advanced filtering by game mechanics"
git commit -m "Fix: image loading fallback for missing covers"
git commit -m "Update: improve mobile responsiveness"
git commit -m "Style: enhance dice roll animation"
```

## 🔍 Troubleshooting Common Issues

### **Branch Out of Sync**
```bash
# Pull latest changes
git checkout dev
git pull origin dev

# If you have conflicts, resolve them
git status
# Edit conflicted files
git add .
git commit -m "Resolve merge conflicts"
```

### **Accidentally Committed to Main**
```bash
# Move commits to dev branch
git checkout dev
git cherry-pick <commit-hash>

# Reset main branch
git checkout main
git reset --hard origin/main
```

### **Need to Hotfix Production**
```bash
# Create hotfix branch from main
git checkout main
git checkout -b hotfix/critical-fix

# Make fix
git add .
git commit -m "Fix: critical production issue"

# Merge to main
git checkout main
git merge hotfix/critical-fix
git push origin main

# Merge to dev to keep in sync
git checkout dev
git merge hotfix/critical-fix
git push origin dev

# Delete hotfix branch
git branch -d hotfix/critical-fix
```

## 🎯 Quick Reference

### **Daily Development**
```bash
git checkout dev
git pull origin dev
# Make changes
git add .
git commit -m "Your change description"
git push origin dev
```

### **Deploy to Production**
```bash
git checkout main
git merge dev
git push origin main
git checkout dev
```

### **Check Status**
```bash
git status              # Current branch and changes
git log --oneline -5    # Recent commits
git branch -a           # All branches
```

## 🌐 GitHub Pages Configuration

- **Source Branch**: `main` (production)
- **Path**: `/ (root)`
- **URL**: `https://sl4ppy.github.io/BoardGameSelector`
- **Build**: Automatic on push to `main`
- **Deployment**: Usually takes 1-2 minutes

---

**Remember**: Always test your changes locally before pushing, and keep the `main` branch stable for production! 🚀 